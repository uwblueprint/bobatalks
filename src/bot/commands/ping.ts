import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

export const ping = new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!');

export async function pingCommand(interaction: ChatInputCommandInteraction) {
  await interaction.reply('🏓 Pong!');
}
