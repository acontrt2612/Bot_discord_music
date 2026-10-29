import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import ffmpegPath from 'ffmpeg-static';
import youtubeDl from 'youtube-dl-exec';

// yt-dlp needs a JS runtime to solve YouTube challenges; Node is already present.
const baseFlags = {
  noWarnings: true,
  jsRuntimes: 'node',
};

const MAX_PLAYLIST_ITEMS = 100;
const MAX_SUGGESTIONS = 25;

const isUrl = (text) => /^https?:\/\//i.test(text);
const noop = () => {};

export function youtubeId(url) {
  return url?.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/)?.[1] ?? null;
}

function toTrack(info, requestedBy) {
  return {
    title: info.title ?? 'Không rõ tên',
    url: info.webpage_url ?? info.url,
    duration: info.duration ?? 0,
    thumbnail: info.thumbnail ?? info.thumbnails?.at(-1)?.url ?? null,
    requestedBy,
  };
}

/**
 * Resolves a search query, video URL or playlist URL into a list of tracks.
 */
export async function resolve(query, requestedBy) {
  const target = isUrl(query) ? query : `ytsearch1:${query}`;
  const info = await youtubeDl(target, {
    ...baseFlags,
    dumpSingleJson: true,
    flatPlaylist: true,
    playlistEnd: MAX_PLAYLIST_ITEMS,
  });

  if (Array.isArray(info.entries)) {
    return {
      playlistTitle: isUrl(query) ? info.title : null,
      tracks: info.entries.filter((e) => e?.url).map((e) => toTrack(e, requestedBy)),
    };
  }
  return { playlistTitle: null, tracks: [toTrack(info, requestedBy)] };
}

const suggestionCache = new Map();

/**
 * Related songs for a YouTube track, taken from its YouTube Mix playlist.
 * Returned tracks have no `requestedBy`; set it when enqueuing.
 */
export async function getSuggestions(track) {
  const id = youtubeId(track.url);
  if (!id) return [];
  if (suggestionCache.has(id)) return suggestionCache.get(id);

  const info = await youtubeDl(`https://www.youtube.com/watch?v=${id}&list=RD${id}`, {
    ...baseFlags,
    dumpSingleJson: true,
    flatPlaylist: true,
    playlistEnd: MAX_SUGGESTIONS + 1,
  });
  const seen = new Set([id]);
  const tracks = (info.entries ?? [])
    .filter((e) => e?.url && !seen.has(e.id) && seen.add(e.id))
    .slice(0, MAX_SUGGESTIONS)
    .map((e) => toTrack(e, null));

  if (suggestionCache.size > 200) suggestionCache.delete(suggestionCache.keys().next().value);
  suggestionCache.set(id, tracks);
  return tracks;
}

// Above this size (long videos, livestreams) the audio is no longer kept, so seeking is disabled.
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;

/**
 * Downloads a track's audio once with yt-dlp and keeps it in memory,
 * so seeking or changing filters can replay it without downloading again.
 */
export class AudioSource {
  constructor(url) {
    this.chunks = [];
    this.size = 0;
    this.ended = false;
    this.seekable = true;
    this.readers = new Set();

    this.process = youtubeDl.exec(
      url,
      { ...baseFlags, output: '-', format: 'bestaudio[acodec=opus]/bestaudio/best', quiet: true },
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    // execa rejects when we kill the process on skip/stop; that is expected.
    this.process.catch(noop);

    this.process.stdout.on('data', (chunk) => {
      if (this.seekable) {
        this.chunks.push(chunk);
        this.size += chunk.length;
        if (this.size > MAX_BUFFER_BYTES) {
          this.seekable = false;
          this.chunks = [];
        }
      }
      for (const reader of this.readers) reader.write(chunk);
    });
    this.process.stdout.once('close', () => {
      this.ended = true;
      for (const reader of this.readers) reader.end();
    });
    this.process.stdout.on('error', noop);
  }

  /** A stream of the audio from the beginning, following the download as it continues. */
  createReader() {
    const reader = new PassThrough();
    reader.on('error', noop);
    for (const chunk of this.chunks) reader.write(chunk);
    if (this.ended) {
      reader.end();
    } else {
      this.readers.add(reader);
      reader.once('close', () => this.readers.delete(reader));
    }
    return reader;
  }

  destroy() {
    if (this.process.exitCode === null) this.process.kill();
    for (const reader of this.readers) reader.destroy();
    this.readers.clear();
    this.chunks = [];
  }
}

/**
 * Decodes an AudioSource into 48kHz stereo PCM starting at `offset` seconds, with an optional ffmpeg filter.
 * The caller must kill the returned process when done.
 */
export function createPcmStream(source, { offset = 0, filter = null } = {}) {
  // atrim works on source time, so seeking stays correct with speed-changing filters.
  const af = [offset > 0 && `atrim=start=${offset}`, offset > 0 && 'asetpts=PTS-STARTPTS', filter]
    .filter(Boolean)
    .join(',');
  const ffmpeg = spawn(
    ffmpegPath,
    ['-loglevel', 'error', '-i', 'pipe:0', ...(af ? ['-af', af] : []), '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'],
    { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true },
  );
  ffmpeg.stdin.on('error', noop);
  source.createReader().pipe(ffmpeg.stdin);
  return ffmpeg;
}

/** Track length, or "Live" for streams without a duration. */
export function formatDuration(seconds) {
  return seconds ? formatTime(seconds) : 'Live';
}

export function formatTime(seconds) {
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const m = Math.floor((seconds / 60) % 60).toString().padStart(2, '0');
  const h = Math.floor(seconds / 3600);
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}
