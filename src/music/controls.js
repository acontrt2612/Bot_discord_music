import { ActionRowBuilder, EmbedBuilder, MessageFlags, StringSelectMenuBuilder } from 'discord.js';
import { Filters, SEEK_STEP, VOLUME_STEP } from './constants.js';
import { toggleFavorite } from './favorites.js';
import { findLyrics } from './lyrics.js';
import { getQueue } from './manager.js';
import { customId } from './panel.js';

const ephemeral = (interaction, content) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral });

/** Error message if the member can't control this queue, otherwise null. */
export function checkSameChannel(interaction, queue) {
  if (interaction.member.voice.channelId !== queue.voiceChannel.id) {
    return `❌ Bạn cần vào kênh <#${queue.voiceChannel.id}> để điều khiển nhạc.`;
  }
  return null;
}

export function filterMenu(selected) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId('filterselect'))
      .setPlaceholder('Chọn bộ lọc âm thanh')
      .addOptions(
        Object.entries(Filters).map(([value, f]) => ({ label: f.label, value, default: value === selected })),
      ),
  );
}

export async function lyricsReply(interaction, query) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await findLyrics(query).catch(() => null);
  if (!result) return interaction.editReply(`❌ Không tìm thấy lời bài hát cho **${query}**.`);

  const lyrics = result.lyrics.length > 4000 ? `${result.lyrics.slice(0, 4000)}\n…` : result.lyrics;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🎤 ${result.artist} - ${result.title}`.slice(0, 256))
    .setDescription(lyrics)
    .setFooter({ text: 'Nguồn: lrclib.net' });
  return interaction.editReply({ embeds: [embed] });
}

// Panel buttons that change playback. Each returns an error message, or nothing on success.
const panelActions = {
  resume: (q) => (q.resume() ? null : '❌ Nhạc không bị tạm dừng.'),
  pause: (q) => (q.pause() ? null : '❌ Không có gì để tạm dừng.'),
  skip: (q) => (q.skip() ? null : '❌ Không có bài nào đang phát.'),
  previous: (q) => (q.previous() ? null : '❌ Chưa có bài nào trước đó.'),
  loop: (q) => void q.cycleLoop(),
  voldown: (q) => void q.setVolume(q.volume - VOLUME_STEP),
  volup: (q) => void q.setVolume(q.volume + VOLUME_STEP),
  rewind: (q) => (q.seek(q.position - SEEK_STEP) ? null : '❌ Bài này không tua được.'),
  forward: (q) => (q.seek(q.position + SEEK_STEP) ? null : '❌ Bài này không tua được.'),
  shuffle: (q) => {
    if (q.tracks.length < 2) return '❌ Cần ít nhất 2 bài trong hàng đợi.';
    q.shuffle();
  },
  autoplay: (q) => {
    q.autoplay = !q.autoplay;
  },
  stop: (q) => void q.destroy(),
};

/** Handles buttons and select menus whose customId starts with "music:". */
export async function handleMusicComponent(interaction) {
  const action = interaction.customId.split(':')[1];
  const queue = getQueue(interaction.guildId);
  if (!queue) return ephemeral(interaction, '❌ Bot đang không phát nhạc.');

  // Like and lyrics only read the current track, so anyone may use them.
  if (action === 'like') {
    if (!queue.current) return ephemeral(interaction, '❌ Không có bài nào đang phát.');
    const liked = await toggleFavorite(interaction.user.id, queue.current);
    return ephemeral(
      interaction,
      liked
        ? `❤️ Đã thêm **${queue.current.title}** vào bài yêu thích. Dùng \`/liked\` để xem.`
        : `💔 Đã bỏ **${queue.current.title}** khỏi bài yêu thích.`,
    );
  }
  if (action === 'lyrics') {
    if (!queue.current) return ephemeral(interaction, '❌ Không có bài nào đang phát.');
    return lyricsReply(interaction, queue.current.title);
  }

  const error = checkSameChannel(interaction, queue);
  if (error) return ephemeral(interaction, error);

  if (action === 'filter') {
    return interaction.reply({
      content: '🎚️ Chọn bộ lọc âm thanh:',
      components: [filterMenu(queue.filter)],
      flags: MessageFlags.Ephemeral,
    });
  }
  if (action === 'filterselect') {
    const name = interaction.values[0];
    queue.setFilter(name);
    queue.refreshPanel();
    return interaction.update({ content: `🎚️ Bộ lọc: **${Filters[name].label}**`, components: [] });
  }
  if (action === 'suggest') {
    const track = queue.suggestions.find((t) => t.url === interaction.values[0]);
    if (!track) return ephemeral(interaction, '❌ Gợi ý này đã cũ, hãy chọn lại.');
    await interaction.deferUpdate();
    queue.enqueue([{ ...track, requestedBy: interaction.user.id }]);
    return interaction.followUp({
      content: `➕ Đã thêm **${track.title}** vào hàng đợi.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const run = panelActions[action];
  if (!run) return;
  // Acknowledge first: skip/previous/stop replace or close the panel message.
  await interaction.deferUpdate();
  const failure = run(queue);
  if (failure) return interaction.followUp({ content: failure, flags: MessageFlags.Ephemeral });
  queue.refreshPanel();
}
