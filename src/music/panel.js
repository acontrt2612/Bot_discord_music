import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  escapeMarkdown,
} from 'discord.js';
import { Filters, LoopLabels, LoopMode } from './constants.js';
import { formatDuration, formatTime } from './ytdlp.js';

const UP_NEXT_COUNT = 10;
const COLOR = 0x5865f2;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
// Brackets would break the [title](url) markdown link.
const safeTitle = (title, max = 60) => escapeMarkdown(truncate(title.replace(/[[\]]/g, ''), max));

export const customId = (action) => `music:${action}`;

function button(action, emoji, { style = ButtonStyle.Secondary, disabled = false } = {}) {
  return new ButtonBuilder().setCustomId(customId(action)).setEmoji(emoji).setStyle(style).setDisabled(disabled);
}

function progressBar(position, duration, size = 14) {
  if (!duration) return '🔴 LIVE';
  const filled = Math.min(size - 1, Math.round((position / duration) * (size - 1)));
  return `${'▬'.repeat(filled)}🔘${'▬'.repeat(size - 1 - filled)}`;
}

function footer(queue) {
  return {
    text: [
      `Âm lượng: ${queue.volume}`,
      `Lặp: ${LoopLabels[queue.loop]}`,
      `Bộ lọc: ${Filters[queue.filter].label}`,
      `Tự phát: ${queue.autoplay ? 'Bật' : 'Tắt'}`,
    ].join(' • '),
    iconURL: queue.client.user.displayAvatarURL(),
  };
}

function suggestionRow(queue) {
  const menu = new StringSelectMenuBuilder().setCustomId(customId('suggest'));
  if (!queue.suggestions.length) {
    return new ActionRowBuilder().addComponents(
      menu
        .setPlaceholder('Đang tải bài gợi ý...')
        .setDisabled(true)
        .addOptions({ label: 'Không có', value: 'none' }),
    );
  }
  return new ActionRowBuilder().addComponents(
    menu.setPlaceholder('Chọn một bài gợi ý').addOptions(
      queue.suggestions.map((track) => ({
        label: truncate(track.title, 100),
        description: formatDuration(track.duration),
        value: track.url,
        emoji: '🎵',
      })),
    ),
  );
}

function controlRows(queue) {
  const loopActive = queue.loop !== LoopMode.OFF;
  const seekDisabled = !queue.canSeek;
  return [
    new ActionRowBuilder().addComponents(
      button('resume', '▶️', { disabled: !queue.paused }),
      button('previous', '⏮️', { disabled: !queue.history.length }),
      button('pause', '⏸️', { disabled: queue.paused }),
      button('skip', '⏭️'),
      button('loop', queue.loop === LoopMode.TRACK ? '🔂' : '🔁', {
        style: loopActive ? ButtonStyle.Success : ButtonStyle.Secondary,
      }),
    ),
    new ActionRowBuilder().addComponents(
      button('voldown', '🔉', { disabled: queue.volume <= 0 }),
      button('rewind', '⏪', { disabled: seekDisabled }),
      button('like', '❤️'),
      button('forward', '⏩', { disabled: seekDisabled }),
      button('volup', '🔊'),
    ),
    new ActionRowBuilder().addComponents(
      button('lyrics', '🎤'),
      button('shuffle', '🔀', { disabled: queue.tracks.length < 2 }),
      button('stop', '✖️'),
      button('filter', '🎚️', {
        style: queue.filter !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary,
      }),
      button('autoplay', '📻', {
        style: queue.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary,
      }),
    ),
  ];
}

/**
 * Message payload for the music control panel.
 * @param {import('./GuildQueue.js').GuildQueue} queue
 */
export function buildPanel(queue) {
  const embed = new EmbedBuilder().setColor(COLOR);

  if (queue.destroyed) {
    embed.setDescription('⏹️ Đã dừng phát nhạc.');
    return { embeds: [embed], components: [] };
  }

  const { current } = queue;
  if (!current) {
    embed
      .setDescription('📭 Đã phát hết hàng đợi. Dùng `/play` để thêm bài.')
      .setFooter(footer(queue));
    return { embeds: [embed], components: [] };
  }

  const total = queue.tracks.length + 1;
  const position = queue.position;
  const upNext = queue.tracks
    .slice(0, UP_NEXT_COUNT)
    .map(
      (t, i) =>
        `\`${i + 1}.\` **${safeTitle(t.title, 45)}** — [\`${formatDuration(t.duration)}\`] — <@${t.requestedBy}>`,
    );
  const more = queue.tracks.length - UP_NEXT_COUNT;

  const lines = [
    `${queue.paused ? '⏸️' : '🎶'} **[${safeTitle(current.title)}](${current.url})** — [\`${formatDuration(current.duration)}\`]`,
    `${progressBar(position, current.duration)} \`${formatTime(position)}\``,
    `Yêu cầu bởi — <@${current.requestedBy}>`,
    '',
    '**Tiếp theo:**',
    ...(upNext.length ? upNext : ['*Không còn bài nào*']),
  ];
  if (more > 0) lines.push(`*+${more} bài nữa trong hàng đợi*`);

  embed
    .setTitle(`${total} bài trong hàng đợi`)
    .setDescription(lines.join('\n'))
    .setFooter(footer(queue));
  if (current.thumbnail) embed.setThumbnail(current.thumbnail);

  return { embeds: [embed], components: [suggestionRow(queue), ...controlRows(queue)] };
}
