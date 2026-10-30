import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { Filters, LoopLabels, LoopMode, MAX_VOLUME } from '../music/constants.js';
import { checkSameChannel, lyricsReply } from '../music/controls.js';
import { clearFavorites, getFavorites } from '../music/favorites.js';
import { createQueue, getQueue } from '../music/manager.js';
import { formatDuration, resolve } from '../music/ytdlp.js';

const QUEUE_PAGE_SIZE = 10;

const reply = (interaction, content) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral });

/**
 * Wraps a command that needs an active queue and the user in the bot's voice channel.
 */
function withQueue(handler) {
  return async (interaction) => {
    const queue = getQueue(interaction.guildId);
    if (!queue) return reply(interaction, '❌ Bot đang không phát nhạc.');
    const error = checkSameChannel(interaction, queue);
    if (error) return reply(interaction, error);
    return handler(interaction, queue);
  };
}

/** Error message if the member can't start playback here, otherwise null. */
function checkCanPlay(interaction) {
  const voiceChannel = interaction.member.voice.channel;
  if (!voiceChannel) return '❌ Bạn cần vào một kênh thoại trước.';
  if (!voiceChannel.permissionsFor(interaction.client.user)?.has(['Connect', 'Speak'])) {
    return '❌ Bot không có quyền vào hoặc nói trong kênh thoại này.';
  }
  const queue = getQueue(interaction.guildId);
  if (queue && queue.voiceChannel.id !== voiceChannel.id) {
    return `❌ Bot đang phát nhạc ở <#${queue.voiceChannel.id}>.`;
  }
  return null;
}

/** Joins the member's channel if needed and enqueues tracks. Call after deferReply. */
async function enqueueTracks(interaction, tracks) {
  let queue = getQueue(interaction.guildId);
  if (!queue) {
    try {
      queue = await createQueue(interaction.member.voice.channel, interaction.channel);
    } catch {
      await interaction.editReply('❌ Không kết nối được vào kênh thoại.');
      return null;
    }
  }
  queue.enqueue(tracks);
  return queue;
}

/** "1:30", "01:02:03" or "90" to seconds; NaN when invalid. */
function parseTime(text) {
  const parts = text.trim().split(':').map(Number);
  if (parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return NaN;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

const play = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Phát nhạc từ tên bài, link YouTube/Spotify/SoundCloud hoặc playlist')
    .addStringOption((o) =>
      o.setName('query').setDescription('Tên bài hát hoặc đường link (YouTube, Spotify, SoundCloud...)').setRequired(true),
    ),
  async execute(interaction) {
    const error = checkCanPlay(interaction);
    if (error) return reply(interaction, error);

    await interaction.deferReply();
    const query = interaction.options.getString('query', true);

    let result;
    try {
      result = await resolve(query, interaction.user.id);
    } catch (err) {
      console.error('Resolve failed:', err.message);
      return interaction.editReply('❌ Không tìm thấy hoặc không tải được bài hát này.');
    }
    if (!result.tracks.length) return interaction.editReply('❌ Không tìm thấy kết quả nào.');

    const queue = await enqueueTracks(interaction, result.tracks);
    if (!queue) return;

    if (result.playlistTitle) {
      return interaction.editReply(
        `📃 Đã thêm **${result.tracks.length}** bài từ ${result.kind ?? 'playlist'} **${result.playlistTitle}**.`,
      );
    }
    const [track] = result.tracks;
    return interaction.editReply(
      queue.current === track
        ? `▶️ Bắt đầu phát: **${track.title}**`
        : `➕ Đã thêm vào hàng đợi (#${queue.tracks.indexOf(track) + 1}): **${track.title}** \`${formatDuration(track.duration)}\``,
    );
  },
};

const skip = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hiện tại'),
  execute: withQueue(async (interaction, queue) => {
    if (!queue.current) return reply(interaction, '❌ Không có bài nào đang phát.');
    const title = queue.current.title;
    queue.skip();
    return interaction.reply(`⏭️ Đã bỏ qua **${title}**.`);
  }),
};

const previous = {
  data: new SlashCommandBuilder().setName('previous').setDescription('Quay lại bài trước'),
  execute: withQueue(async (interaction, queue) => {
    if (!queue.previous()) return reply(interaction, '❌ Chưa có bài nào trước đó.');
    return interaction.reply('⏮️ Quay lại bài trước.');
  }),
};

const stop = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Dừng phát nhạc, xoá hàng đợi và rời kênh thoại'),
  execute: withQueue(async (interaction, queue) => {
    queue.destroy();
    return interaction.reply('⏹️ Đã dừng nhạc và rời kênh thoại.');
  }),
};

const pause = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Tạm dừng bài hiện tại'),
  execute: withQueue(async (interaction, queue) => {
    if (!queue.pause()) return reply(interaction, '❌ Không có gì để tạm dừng.');
    queue.refreshPanel();
    return interaction.reply('⏸️ Đã tạm dừng.');
  }),
};

const resume = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Tiếp tục phát'),
  execute: withQueue(async (interaction, queue) => {
    if (!queue.resume()) return reply(interaction, '❌ Nhạc không bị tạm dừng.');
    queue.refreshPanel();
    return interaction.reply('▶️ Tiếp tục phát.');
  }),
};

const seek = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Tua đến thời điểm trong bài')
    .addStringOption((o) =>
      o.setName('time').setDescription('Ví dụ: 1:30 hoặc 90').setRequired(true),
    ),
  execute: withQueue(async (interaction, queue) => {
    const seconds = parseTime(interaction.options.getString('time', true));
    if (Number.isNaN(seconds)) return reply(interaction, '❌ Thời gian không hợp lệ. Ví dụ: `1:30`.');
    if (!queue.seek(seconds)) return reply(interaction, '❌ Bài này không tua được.');
    queue.refreshPanel();
    return interaction.reply(`⏩ Đã tua đến \`${formatDuration(seconds)}\`.`);
  }),
};

const nowPlaying = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Gửi lại bảng điều khiển nhạc xuống cuối kênh'),
  async execute(interaction) {
    const queue = getQueue(interaction.guildId);
    if (!queue?.current) return reply(interaction, '❌ Không có bài nào đang phát.');
    queue.textChannel = interaction.channel;
    queue.resendPanel();
    return reply(interaction, '🎛️ Đã gửi lại bảng điều khiển.');
  },
};

const queueCmd = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Xem toàn bộ hàng đợi')
    .addIntegerOption((o) => o.setName('page').setDescription('Trang').setMinValue(1)),
  async execute(interaction) {
    const queue = getQueue(interaction.guildId);
    if (!queue?.current) return reply(interaction, '📭 Hàng đợi trống.');

    const totalPages = Math.max(1, Math.ceil(queue.tracks.length / QUEUE_PAGE_SIZE));
    const page = Math.min(interaction.options.getInteger('page') ?? 1, totalPages);
    const start = (page - 1) * QUEUE_PAGE_SIZE;
    const lines = queue.tracks
      .slice(start, start + QUEUE_PAGE_SIZE)
      .map((t, i) => `\`${start + i + 1}.\` [${t.title}](${t.url}) \`${formatDuration(t.duration)}\``);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎵 Hàng đợi')
      .setDescription(
        `**Đang phát:** [${queue.current.title}](${queue.current.url})\n\n` +
          (lines.join('\n') || '*Không còn bài nào tiếp theo*'),
      )
      .setFooter({
        text: `Trang ${page}/${totalPages} • ${queue.tracks.length} bài chờ • Âm lượng ${queue.volume}% • Lặp: ${LoopLabels[queue.loop]}`,
      });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

const volume = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription(`Chỉnh âm lượng (0-${MAX_VOLUME})`)
    .addIntegerOption((o) =>
      o.setName('level').setDescription('Mức âm lượng').setMinValue(0).setMaxValue(MAX_VOLUME).setRequired(true),
    ),
  execute: withQueue(async (interaction, queue) => {
    const level = queue.setVolume(interaction.options.getInteger('level', true));
    queue.refreshPanel();
    return interaction.reply(`🔊 Âm lượng: **${level}%**`);
  }),
};

const loop = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Chế độ lặp')
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('Kiểu lặp')
        .setRequired(true)
        .addChoices(
          { name: 'Tắt', value: LoopMode.OFF },
          { name: 'Lặp bài hiện tại', value: LoopMode.TRACK },
          { name: 'Lặp cả hàng đợi', value: LoopMode.QUEUE },
        ),
    ),
  execute: withQueue(async (interaction, queue) => {
    const mode = queue.setLoop(interaction.options.getString('mode', true));
    queue.refreshPanel();
    return interaction.reply(`🔁 Chế độ lặp: **${LoopLabels[mode]}**`);
  }),
};

const shuffle = {
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Xáo trộn hàng đợi'),
  execute: withQueue(async (interaction, queue) => {
    if (queue.tracks.length < 2) return reply(interaction, '❌ Cần ít nhất 2 bài trong hàng đợi.');
    queue.shuffle();
    queue.refreshPanel();
    return interaction.reply('🔀 Đã xáo trộn hàng đợi.');
  }),
};

const remove = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Xoá một bài khỏi hàng đợi')
    .addIntegerOption((o) =>
      o.setName('position').setDescription('Vị trí trong /queue').setMinValue(1).setRequired(true),
    ),
  execute: withQueue(async (interaction, queue) => {
    const position = interaction.options.getInteger('position', true);
    if (position > queue.tracks.length) return reply(interaction, '❌ Vị trí không hợp lệ.');
    const track = queue.remove(position - 1);
    queue.refreshPanel();
    return interaction.reply(`🗑️ Đã xoá **${track.title}** khỏi hàng đợi.`);
  }),
};

const filter = {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Bộ lọc âm thanh')
    .addStringOption((o) =>
      o
        .setName('name')
        .setDescription('Tên bộ lọc')
        .setRequired(true)
        .addChoices(...Object.entries(Filters).map(([value, f]) => ({ name: f.label, value }))),
    ),
  execute: withQueue(async (interaction, queue) => {
    const name = interaction.options.getString('name', true);
    queue.setFilter(name);
    queue.refreshPanel();
    return interaction.reply(`🎚️ Bộ lọc: **${Filters[name].label}**`);
  }),
};

const autoplay = {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Bật/tắt tự phát bài liên quan khi hết hàng đợi'),
  execute: withQueue(async (interaction, queue) => {
    queue.autoplay = !queue.autoplay;
    queue.refreshPanel();
    return interaction.reply(`📻 Tự phát: **${queue.autoplay ? 'Bật' : 'Tắt'}**`);
  }),
};

const lyrics = {
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Xem lời bài hát')
    .addStringOption((o) =>
      o.setName('query').setDescription('Tên bài (mặc định: bài đang phát)'),
    ),
  async execute(interaction) {
    const query = interaction.options.getString('query') ?? getQueue(interaction.guildId)?.current?.title;
    if (!query) return reply(interaction, '❌ Không có bài nào đang phát, hãy nhập tên bài.');
    return lyricsReply(interaction, query);
  },
};

const liked = {
  data: new SlashCommandBuilder()
    .setName('liked')
    .setDescription('Bài hát yêu thích của bạn (bấm ❤️ trên bảng điều khiển để thêm)')
    .addSubcommand((s) => s.setName('list').setDescription('Xem danh sách bài yêu thích'))
    .addSubcommand((s) => s.setName('play').setDescription('Phát toàn bộ bài yêu thích'))
    .addSubcommand((s) => s.setName('clear').setDescription('Xoá toàn bộ bài yêu thích')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const favorites = await getFavorites(interaction.user.id);

    if (sub === 'clear') {
      await clearFavorites(interaction.user.id);
      return reply(interaction, '🗑️ Đã xoá danh sách bài yêu thích.');
    }
    if (!favorites.length) return reply(interaction, '💔 Bạn chưa thích bài nào. Bấm ❤️ trên bảng điều khiển nhạc để thêm.');

    if (sub === 'list') {
      const lines = favorites
        .slice(0, 25)
        .map((t, i) => `\`${i + 1}.\` [${t.title}](${t.url}) \`${formatDuration(t.duration)}\``);
      if (favorites.length > 25) lines.push(`*+${favorites.length - 25} bài nữa*`);
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle(`❤️ ${favorites.length} bài yêu thích`)
        .setDescription(lines.join('\n'));
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const error = checkCanPlay(interaction);
    if (error) return reply(interaction, error);
    await interaction.deferReply();
    const tracks = favorites.map((t) => ({ ...t, requestedBy: interaction.user.id }));
    if (!(await enqueueTracks(interaction, tracks))) return;
    return interaction.editReply(`❤️ Đã thêm **${tracks.length}** bài yêu thích vào hàng đợi.`);
  },
};

export default [
  play, skip, previous, stop, pause, resume, seek, nowPlaying, queueCmd,
  volume, loop, shuffle, remove, filter, autoplay, lyrics, liked,
];
