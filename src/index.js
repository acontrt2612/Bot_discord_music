import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { commands, componentHandlers } from './commands/index.js';

if (!process.env.DISCORD_TOKEN) {
  console.error('Thiếu DISCORD_TOKEN trong file .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.commands = new Collection(commands.map((c) => [c.data.name, c]));

const log = (...args) => console.log(`[${new Date().toLocaleTimeString('vi-VN')}]`, ...args);

client.once(Events.ClientReady, (c) => {
  log(`✅ Đã đăng nhập: ${c.user.tag} — đang ở ${c.guilds.cache.size} server`);
});
client.on(Events.ShardDisconnect, () => log('⚠️ Mất kết nối tới Discord'));
client.on(Events.ShardReconnecting, () => log('🔄 Đang kết nối lại...'));
client.on(Events.ShardResume, () => log('✅ Đã kết nối lại'));
client.on(Events.Error, (err) => log('❌ Lỗi client:', err));
process.on('unhandledRejection', (err) => log('❌ Lỗi chưa xử lý:', err));

function getHandler(interaction) {
  if (interaction.isChatInputCommand()) {
    return client.commands.get(interaction.commandName)?.execute;
  }
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    return componentHandlers[interaction.customId.split(':')[0]];
  }
  return undefined;
}

client.on(Events.InteractionCreate, async (interaction) => {
  const handler = getHandler(interaction);
  if (!handler) return;
  const name = interaction.isChatInputCommand() ? `/${interaction.commandName}` : interaction.customId;
  log(`${interaction.user.tag} → ${name} (${interaction.guild?.name ?? interaction.guildId ?? 'DM'})`);

  // Commands used where the bot isn't a member (DMs, or the app installed only for a user)
  // have no voice state to work with; answer instead of letting Discord time out.
  if (!interaction.inCachedGuild()) {
    await interaction
      .reply({
        content: '❌ Bot chưa được thêm vào server này. Hãy bấm **Thêm ứng dụng** trên hồ sơ bot để mời bot vào server trước.',
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return;
  }

  try {
    await handler(interaction);
  } catch (err) {
    console.error(`Lỗi khi xử lý ${interaction.commandName ?? interaction.customId}:`, err);
    const payload = { content: '❌ Đã xảy ra lỗi khi chạy lệnh.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
