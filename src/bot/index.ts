import 'dotenv/config';

import { Client, Events, GatewayIntentBits, Interaction, MessageFlags } from 'discord.js';

import {
  flowerCommand,
  handleFlowerModalSubmit,
  handleFlowerConsentButton,
  handleFlowerShareUsernameButton,
} from './commands/flower.js';
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

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`📊 Serving ${c.guilds.cache.size} server(s)`);
});

client.on('interactionCreate', async (interaction: Interaction) => {
  // Handle button interactions
  if (interaction.isButton()) {
    try {
      if (interaction.customId.startsWith('flowerConsent_')) {
        await handleFlowerConsentButton(interaction);
      } else if (interaction.customId.startsWith('flowerShareUsername_')) {
        await handleFlowerShareUsernameButton(interaction);
      }
    } catch (error) {
      console.error('Error handling button interaction:', error);
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: 'An error occurred while processing your interaction.',
            components: [],
          });
        } else if (!interaction.replied) {
          await interaction.reply({
            content: 'An error occurred while processing your interaction.',
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.followUp({
            content: 'An error occurred while processing your interaction.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        // If we can't reply (e.g., interaction expired), just log it
        console.error('Error sending error message to user:', replyError);
      }
    }
    return;
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    try {
      if (interaction.customId === 'flowerModal') {
        await handleFlowerModalSubmit(interaction);
      }
    } catch (error) {
      console.error('Error handling modal submission:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing your submission.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    return;
  }

  // Handle slash commands
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
      case 'flower':
        await flowerCommand(interaction);
        break;
      default:
        await interaction.reply({ content: 'Unknown command!', flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    console.error('Error handling command:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while executing this command.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
