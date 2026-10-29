import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commands } from './commands/index.js';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Thiếu DISCORD_TOKEN hoặc CLIENT_ID trong file .env');
  process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);
const body = commands.map((c) => c.data.toJSON());

// With GUILD_ID the commands appear instantly in that server; global ones can take up to an hour.
const route = GUILD_ID
  ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  : Routes.applicationCommands(CLIENT_ID);

await rest.put(route, { body });
console.log(`✅ Đã đăng ký ${body.length} lệnh ${GUILD_ID ? `cho server ${GUILD_ID}` : 'toàn cục'}.`);
