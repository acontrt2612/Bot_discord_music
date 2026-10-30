import { mkdir, readFile, writeFile } from 'node:fs/promises';

const DATA_DIR = new URL('../../data/', import.meta.url);
const FILE = new URL('favorites.json', DATA_DIR);

/** @type {Record<string, { title: string, url: string, duration: number, thumbnail: string | null }[]> | null} */
let cache = null;
let writeChain = Promise.resolve();

async function load() {
  if (!cache) {
    try {
      cache = JSON.parse(await readFile(FILE, 'utf8'));
    } catch {
      cache = {};
    }
  }
  return cache;
}

function save() {
  writeChain = writeChain
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      await writeFile(FILE, JSON.stringify(cache, null, 2));
    })
    .catch((err) => console.error('Không lưu được favorites:', err.message));
  return writeChain;
}

export async function getFavorites(userId) {
  return (await load())[userId] ?? [];
}

/** Adds the track to the user's liked songs, or removes it if already there. Returns true when liked. */
export async function toggleFavorite(userId, track) {
  const data = await load();
  const list = (data[userId] ??= []);
  const index = list.findIndex((t) => t.url === track.url);
  if (index >= 0) list.splice(index, 1);
  else {
    const { title, url, duration, thumbnail, search } = track;
    // `search` lets Spotify songs be found on YouTube again when replayed.
    list.push({ title, url, duration, thumbnail, ...(search && { search }) });
  }
  await save();
  return index < 0;
}

export async function clearFavorites(userId) {
  const data = await load();
  delete data[userId];
  await save();
}
