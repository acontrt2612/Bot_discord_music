const API = 'https://lrclib.net/api/search';

// Parts of YouTube titles that are not the song name.
const NOISE = /official|music video|lyrics?|audio|video|m\/?v|visualizer|4k|hd|karaoke/i;

/** Turns "ARTIST | SONG | OFFICIAL MUSIC VIDEO (Prod. X)" into "ARTIST SONG". */
export function cleanTitle(title) {
  return title
    .replace(/[([【][^)\]】]*[)\]】]/g, ' ')
    .split(/[|｜]/)
    .filter((part) => !NOISE.test(part))
    .join(' ')
    .replace(/\b(ft|feat)\.?\s.*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Looks up plain lyrics on lrclib.net (free, no API key).
 * @returns {Promise<{ title: string, artist: string, lyrics: string } | null>}
 */
export async function findLyrics(query) {
  const res = await fetch(`${API}?q=${encodeURIComponent(cleanTitle(query) || query)}`, {
    headers: { 'User-Agent': 'bot_discord' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const hit = (await res.json()).find((item) => item.plainLyrics);
  return hit ? { title: hit.trackName, artist: hit.artistName, lyrics: hit.plainLyrics } : null;
}
