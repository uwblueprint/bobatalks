import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

export const serverinfo = new SlashCommandBuilder()
  .setName('serverinfo')
  .setDescription('Displays information about the server');

export async function serverinfoCommand(interaction: ChatInputCommandInteraction) {
  const { guild } = interaction;

  if (!guild) {
    await interaction.reply('This command can only be used in a server!');
    return;
  }

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📊 ${guild.name} Server Information`)
    .setThumbnail(guild.iconURL() ?? '')
    .addFields(
      { name: '🆔 Server ID', value: guild.id, inline: true },
      { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
      { name: '👥 Members', value: `${guild.memberCount}`, inline: true },
      {
        name: '📅 Created',
        value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
      { name: '💬 Channels', value: `${guild.channels.cache.size}`, inline: true },
      { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
