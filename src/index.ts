import 'dotenv/config';

import { Client, GatewayIntentBits, Interaction } from 'discord.js';

import { pingCommand } from './commands/ping.js';
import { pollCommand } from './commands/poll.js';
import { serverinfoCommand } from './commands/serverinfo.js';
import { userinfoCommand } from './commands/userinfo.js';
import { welcomeCommand } from './commands/welcome.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // GatewayIntentBits.GuildMembers, // Uncomment if you enable this privileged intent in Discord Developer Portal
  ],
});

client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
  console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);
});

client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'ping':
        await pingCommand(interaction);
        break;
      case 'serverinfo':
        await serverinfoCommand(interaction);
        break;
      case 'userinfo':
        await userinfoCommand(interaction);
        break;
      case 'poll':
        await pollCommand(interaction);
        break;
      case 'welcome':
        await welcomeCommand(interaction);
        break;
      default:
        await interaction.reply({ content: 'Unknown command!', ephemeral: true });
    }
  } catch (error) {
    console.error('Error handling command:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while executing this command.',
        ephemeral: true,
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
