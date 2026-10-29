import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { Filters, LoopMode, MAX_VOLUME } from './constants.js';
import { buildPanel } from './panel.js';
import { AudioSource, createPcmStream, getSuggestions } from './ytdlp.js';

const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const PANEL_REFRESH_MS = 15_000;
const MAX_HISTORY = 50;

// Why the current track stopped; decides how loop and history treat it.
const EndReason = Object.freeze({ FINISHED: 'finished', SKIP: 'skip', PREVIOUS: 'previous' });

export class GuildQueue {
  /**
   * @param {import('discord.js').VoiceBasedChannel} voiceChannel
   * @param {import('discord.js').TextBasedChannel} textChannel
   * @param {() => void} onDestroy
   */
  constructor(voiceChannel, textChannel, onDestroy) {
    this.guildId = voiceChannel.guild.id;
    this.client = voiceChannel.client;
    this.voiceChannel = voiceChannel;
    this.textChannel = textChannel;
    this.onDestroy = onDestroy;

    this.tracks = [];
    this.history = [];
    this.current = null;
    this.suggestions = [];
    this.loop = LoopMode.OFF;
    this.autoplay = false;
    this.filter = 'off';
    this.volume = 50;
    this.destroyed = false;

    this.source = null;
    this.prefetch = null;
    this.ffmpeg = null;
    this.resource = null;
    this.seekOffset = 0;
    this.endReason = EndReason.FINISHED;
    this.idleTimer = null;
    this.panelMessage = null;
    this.panelChain = Promise.resolve();
    // Keeps the progress bar moving.
    this.panelTimer = setInterval(() => {
      if (this.current && !this.paused) this.refreshPanel();
    }, PANEL_REFRESH_MS);

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    this.connection.subscribe(this.player);

    this.player.on(AudioPlayerStatus.Idle, () => this.#onTrackEnd());
    this.player.on('error', (err) => {
      console.error(`[${this.guildId}] Player error:`, err.message);
      this.endReason = EndReason.SKIP; // don't loop a broken track forever
      this.#send(`⚠️ Lỗi khi phát **${this.current?.title ?? 'bài hát'}**, chuyển bài tiếp theo.`);
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Moved to another channel or reconnecting: wait briefly before giving up.
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.destroy();
      }
    });
    this.connection.on(VoiceConnectionStatus.Destroyed, () => this.destroy());
  }

  async waitUntilReady() {
    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (err) {
      this.destroy();
      throw err;
    }
  }

  // ---- Queue controls ----

  enqueue(tracks) {
    this.tracks.push(...tracks);
    clearTimeout(this.idleTimer);
    if (this.current) {
      this.#prefetchNext();
      this.refreshPanel();
    } else {
      this.#playNext();
    }
  }

  skip() {
    if (!this.current) return false;
    this.endReason = EndReason.SKIP;
    return this.player.stop(true);
  }

  previous() {
    const prev = this.history.pop();
    if (!prev) return false;
    this.tracks.unshift(prev);
    if (!this.current) {
      clearTimeout(this.idleTimer);
      this.#playNext();
      return true;
    }
    this.tracks.splice(1, 0, this.current);
    this.endReason = EndReason.PREVIOUS;
    return this.player.stop(true);
  }

  pause() {
    return this.player.pause();
  }

  resume() {
    return this.player.unpause();
  }

  get paused() {
    return this.player.state.status === AudioPlayerStatus.Paused;
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(MAX_VOLUME, volume));
    this.resource?.volume?.setVolume(this.volume / 100);
    return this.volume;
  }

  cycleLoop() {
    const modes = Object.values(LoopMode);
    return this.setLoop(modes[(modes.indexOf(this.loop) + 1) % modes.length]);
  }

  setLoop(mode) {
    this.loop = mode;
    this.#prefetchNext();
    return mode;
  }

  shuffle() {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
    this.#prefetchNext();
  }

  remove(index) {
    const [track] = this.tracks.splice(index, 1);
    this.#prefetchNext();
    return track;
  }

  get canSeek() {
    return Boolean(this.current?.duration && this.source?.seekable);
  }

  /** Current playback position in seconds, measured on the original track. */
  get position() {
    const speed = Filters[this.filter].speed ?? 1;
    return Math.floor(this.seekOffset + ((this.resource?.playbackDuration ?? 0) / 1000) * speed);
  }

  seek(seconds) {
    if (!this.canSeek) return false;
    if (seconds >= this.current.duration) return this.skip();
    this.#startStream(Math.max(0, Math.floor(seconds)));
    return true;
  }

  setFilter(name) {
    if (!Filters[name]) return false;
    const position = this.canSeek ? this.position : 0;
    this.filter = name;
    if (this.current && this.source) this.#startStream(position);
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this.idleTimer);
    clearInterval(this.panelTimer);
    this.tracks = [];
    this.current = null;
    this.#releaseAudio();
    this.prefetch?.source.destroy();
    this.prefetch = null;
    this.player.stop(true);
    if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection.destroy();
    }
    this.refreshPanel();
    this.onDestroy();
  }

  // ---- Control panel ----

  /** Re-renders the control panel message with the current state. */
  refreshPanel() {
    this.#panelOp(() => this.panelMessage?.edit(buildPanel(this)));
  }

  /** Deletes the old control panel and sends a fresh one at the bottom of the channel. */
  resendPanel() {
    this.#panelOp(async () => {
      const old = this.panelMessage;
      this.panelMessage = null;
      old?.delete().catch(() => {});
      this.panelMessage = await this.textChannel.send(buildPanel(this));
    });
  }

  // Panel updates run one at a time so a slow send can't be overwritten by an older edit.
  #panelOp(fn) {
    this.panelChain = this.panelChain
      .then(fn)
      .catch((err) => console.error(`[${this.guildId}] Panel update failed:`, err.message));
  }

  // ---- Playback internals ----

  #onTrackEnd() {
    const finished = this.current;
    const reason = this.endReason;
    const source = this.source;
    this.endReason = EndReason.FINISHED;
    this.current = null;

    // Repeating a fully downloaded track reuses its audio instead of downloading again.
    const repeat = finished && reason === EndReason.FINISHED && this.loop === LoopMode.TRACK && source?.size > 0;
    if (repeat && source.seekable) {
      this.prefetch?.source.destroy();
      this.prefetch = { track: finished, source };
      this.source = null;
    }
    this.#releaseAudio();

    if (finished && reason !== EndReason.PREVIOUS) {
      if (repeat) {
        this.tracks.unshift(finished);
      } else {
        this.history.push(finished);
        if (this.history.length > MAX_HISTORY) this.history.shift();
        if (this.loop === LoopMode.QUEUE) this.tracks.push(finished);
      }
    }
    this.#playNext();
  }

  #playNext() {
    if (this.destroyed) return;
    const track = this.tracks.shift();
    if (!track) {
      this.#onQueueEmpty();
      return;
    }

    this.current = track;
    this.suggestions = [];
    if (this.prefetch?.track === track) {
      this.source = this.prefetch.source;
      this.prefetch = null;
    } else {
      this.source = new AudioSource(track.url);
    }
    this.#startStream(0);
    this.resendPanel();
    this.#loadSuggestions(track);
    this.#prefetchNext();
  }

  async #onQueueEmpty() {
    const last = this.history.at(-1);
    if (this.autoplay && last) {
      try {
        const played = new Set(this.history.map((t) => t.url));
        const next = (await getSuggestions(last)).find((t) => !played.has(t.url));
        if (next && !this.destroyed && !this.current) {
          this.tracks.push({ ...next, requestedBy: this.client.user.id });
          this.#playNext();
          return;
        }
      } catch (err) {
        console.error(`[${this.guildId}] Autoplay failed:`, err.message);
      }
    }
    if (this.destroyed || this.current) return;

    this.refreshPanel();
    this.idleTimer = setTimeout(() => {
      this.#send('👋 Hết nhạc một lúc rồi, mình rời kênh nhé.');
      this.destroy();
    }, IDLE_TIMEOUT_MS);
  }

  /** (Re)starts decoding the current source at `offset` seconds with the active filter. */
  #startStream(offset) {
    const oldFfmpeg = this.ffmpeg;
    this.ffmpeg = createPcmStream(this.source, { offset, filter: Filters[this.filter].af });
    this.resource = createAudioResource(this.ffmpeg.stdout, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });
    this.resource.volume.setVolume(this.volume / 100);
    this.seekOffset = offset;
    // Swapping the resource detaches the old one without emitting Idle, so kill it only afterwards.
    this.player.play(this.resource);
    oldFfmpeg?.kill();
  }

  #releaseAudio() {
    this.ffmpeg?.kill();
    this.source?.destroy();
    this.ffmpeg = null;
    this.source = null;
    this.resource = null;
  }

  /** Starts downloading the next track early so the switch is instant. */
  #prefetchNext() {
    const next = this.loop === LoopMode.TRACK ? null : this.tracks[0];
    if (this.prefetch?.track === next) return;
    this.prefetch?.source.destroy();
    this.prefetch = next ? { track: next, source: new AudioSource(next.url) } : null;
  }

  async #loadSuggestions(track) {
    try {
      const suggestions = await getSuggestions(track);
      if (this.current !== track) return;
      this.suggestions = suggestions;
      this.refreshPanel();
    } catch (err) {
      console.error(`[${this.guildId}] Suggestions failed:`, err.message);
    }
  }

  #send(payload) {
    this.textChannel?.send(payload).catch(() => {});
  }
}
