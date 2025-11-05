import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

export const userinfo = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription('Displays information about a user')
  .addUserOption((option) =>
    option.setName('user').setDescription('The user to get info about').setRequired(false),
  );

export async function userinfoCommand(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const member = interaction.guild?.members.cache.get(targetUser.id);

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`👤 User Information`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '👤 Username', value: targetUser.tag, inline: true },
      { name: '🆔 User ID', value: targetUser.id, inline: true },
      { name: '🤖 Bot?', value: targetUser.bot ? 'Yes' : 'No', inline: true },
      {
        name: '📅 Account Created',
        value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
    );

  if (member) {
    embed.addFields(
      {
        name: '📥 Joined Server',
        value: `<t:${Math.floor((member.joinedTimestamp ?? 0) / 1000)}:R>`,
        inline: true,
      },
      {
        name: '🎭 Roles',
        value: member.roles.cache.size > 1 ? `${member.roles.cache.size - 1}` : 'None',
        inline: true,
      },
    );
  }

  embed.setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
