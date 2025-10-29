import 'dotenv/config';

import { Client, GatewayIntentBits, Interaction } from 'discord.js';

import { pingCommand } from './commands/ping.ts';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
});

client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await pingCommand(interaction);
  }
});

client.login(process.env.DISCORD_TOKEN);
