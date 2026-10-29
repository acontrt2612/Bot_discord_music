import { GuildQueue } from './GuildQueue.js';

/** @type {Map<string, GuildQueue>} */
const queues = new Map();

export function getQueue(guildId) {
  return queues.get(guildId);
}

export async function createQueue(voiceChannel, textChannel) {
  const guildId = voiceChannel.guild.id;
  const queue = new GuildQueue(voiceChannel, textChannel, () => queues.delete(guildId));
  queues.set(guildId, queue);
  await queue.waitUntilReady();
  return queue;
}
