import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

export const welcome = new SlashCommandBuilder()
  .setName('welcome')
  .setDescription('Sends a welcome message')
  .addUserOption((option) =>
    option.setName('user').setDescription('User to welcome (defaults to you)').setRequired(false),
  );

export async function welcomeCommand(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const { guild } = interaction;

  const embed = new EmbedBuilder()
    .setColor('#57F287')
    .setTitle(`🎉 Welcome to ${guild?.name ?? 'the server'}!`)
    .setDescription(`Hey ${targetUser}, welcome aboard! We're glad to have you here.`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      {
        name: '📜 Read the Rules',
        value: 'Make sure to check out our server rules!',
        inline: true,
      },
      { name: '💬 Say Hi', value: 'Introduce yourself to the community!', inline: true },
      { name: '🎮 Have Fun', value: 'Enjoy your time here!', inline: true },
    )
    .setFooter({ text: `Member #${guild?.memberCount ?? '???'}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
