import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

export const poll = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Creates a poll with up to 5 options')
  .addStringOption((option) =>
    option.setName('question').setDescription('The poll question').setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('option1').setDescription('First option').setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('option2').setDescription('Second option').setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('option3').setDescription('Third option').setRequired(false),
  )
  .addStringOption((option) =>
    option.setName('option4').setDescription('Fourth option').setRequired(false),
  )
  .addStringOption((option) =>
    option.setName('option5').setDescription('Fifth option').setRequired(false),
  );

export async function pollCommand(interaction: ChatInputCommandInteraction) {
  const question = interaction.options.getString('question', true);
  const options: string[] = [];

  // Collect all provided options
  for (let i = 1; i <= 5; i++) {
    const option = interaction.options.getString(`option${i}`);
    if (option) options.push(option);
  }

  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

  const description = options.map((opt, idx) => `${emojis[idx]} ${opt}`).join('\n');

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📊 ${question}`)
    .setDescription(description)
    .setFooter({ text: `Poll created by ${interaction.user.tag}` })
    .setTimestamp();

  const message = await interaction.reply({ embeds: [embed], fetchReply: true });

  // Add reaction emojis
  for (let i = 0; i < options.length; i++) {
    await message.react(emojis[i]);
  }
}
