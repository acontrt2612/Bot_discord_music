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

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Đã đăng nhập: ${c.user.tag}`);
});

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
  if (!interaction.inGuild()) return;
  const handler = getHandler(interaction);
  if (!handler) return;

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
