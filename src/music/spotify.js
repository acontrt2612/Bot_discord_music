// Spotify audio is DRM-protected, so we only read metadata here and play the matching song from YouTube.
// Metadata comes from the public embed page, which needs no API key.

const SPOTIFY_URL = /open\.spotify\.com\/(?:intl-[\w-]+\/)?(track|album|playlist|artist)\/([A-Za-z0-9]+)/;
const SPOTIFY_URI = /^spotify:(track|album|playlist|artist):([A-Za-z0-9]+)$/;
const SHORT_LINK = /^https?:\/\/(spotify\.link|spotify\.app\.link)\//i;

export function isSpotify(query) {
  return SPOTIFY_URL.test(query) || SPOTIFY_URI.test(query.trim()) || SHORT_LINK.test(query);
}

/** spotify.link short links redirect to open.spotify.com; follow them to find the real target. */
async function parse(query) {
  const match = query.match(SPOTIFY_URL) ?? query.trim().match(SPOTIFY_URI);
  if (match) return { type: match[1], id: match[2] };
  if (!SHORT_LINK.test(query)) return null;

  const res = await fetch(query, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
  const target = res.url.match(SPOTIFY_URL) ?? (await res.text()).match(SPOTIFY_URL);
  return target ? { type: target[1], id: target[2] } : null;
}

async function fetchEntity(type, id) {
  const res = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Spotify embed ${res.status}`);
  const json = (await res.text()).match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)?.[1];
  const entity = json && JSON.parse(json).props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error('Spotify embed has no data');
  return entity;
}

function coverOf(entity) {
  const images = entity.visualIdentity?.image ?? [];
  const largest = images.reduce((best, img) => (img.maxHeight > (best?.maxHeight ?? 0) ? img : best), null);
  return largest?.url ?? entity.coverArt?.sources?.[0]?.url ?? null;
}

function toTrack({ id, title, artists, durationMs, thumbnail }, requestedBy) {
  return {
    title: artists ? `${artists} - ${title}` : title,
    url: `https://open.spotify.com/track/${id}`,
    duration: Math.round(durationMs / 1000),
    thumbnail,
    requestedBy,
    // Searched on YouTube right before playing (see ytdlp.js playableUrl).
    search: { query: artists ? `${artists} - ${title}` : title, duration: Math.round(durationMs / 1000) },
  };
}

/**
 * Resolves a Spotify track/album/playlist/artist link into tracks.
 * Albums and playlists come from the embed page, which lists at most 100 songs.
 */
export async function resolveSpotify(query, requestedBy) {
  const target = await parse(query);
  if (!target) return { playlistTitle: null, tracks: [] };
  const entity = await fetchEntity(target.type, target.id);

  if (target.type === 'track') {
    const track = toTrack(
      {
        id: entity.id,
        title: entity.name ?? entity.title,
        artists: entity.artists?.map((a) => a.name).join(', '),
        durationMs: entity.duration,
        thumbnail: coverOf(entity),
      },
      requestedBy,
    );
    return { playlistTitle: null, tracks: [track] };
  }

  const cover = coverOf(entity);
  const tracks = (entity.trackList ?? [])
    .filter((t) => t.uri?.startsWith('spotify:track:') && t.title)
    .map((t) =>
      toTrack(
        {
          id: t.uri.split(':')[2],
          title: t.title,
          artists: t.subtitle,
          durationMs: t.duration,
          // Album songs share the album cover; playlist songs get the YouTube thumbnail later.
          thumbnail: target.type === 'album' ? cover : null,
        },
        requestedBy,
      ),
    );
  const kind = { album: 'album', playlist: 'playlist', artist: 'top bài của' }[target.type];
  return { playlistTitle: entity.name ?? entity.title, kind, tracks };
}
