import 'dotenv/config';

import { REST, Routes } from 'discord.js';

import { flower } from './commands/flower.js';

const commands = [flower.toJSON()];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    console.log('🔄 Registering commands...');
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.GUILD_ID!), {
      body: commands,
    });
    console.log('✅ Commands registered.');
  } catch (err) {
    console.error(err);
  }
})();
