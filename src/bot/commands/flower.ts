import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  EmbedBuilder,
  ModalActionRowComponentBuilder,
} from 'discord.js';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

export const flower = new SlashCommandBuilder()
  .setName('flower')
  .setDescription(
    'Submit a flower 💐 - a message of acknowledgement, congratulations, or encouragement',
  );

// Content filter using obscenity library
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

function containsInappropriateContent(text: string): boolean {
  return matcher.hasMatch(text);
}

export async function flowerCommand(interaction: ChatInputCommandInteraction) {
  // Create modal form
  const modal = new ModalBuilder().setCustomId('flowerModal').setTitle('Submit Flowers 💐');

  // Message input (required)
  const messageInput = new TextInputBuilder()
    .setCustomId('flowerMessage')
    .setLabel('Your Message')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(
      'Example: "I finally landed my first internship!" or "Shoutout to Eileen for being so supportive!"',
    )
    .setRequired(true)
    .setMaxLength(1000)
    .setMinLength(10);

  // Name input (optional)
  const nameInput = new TextInputBuilder()
    .setCustomId('flowerName')
    .setLabel('Your Name (Optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Leave blank to remain anonymous')
    .setRequired(false)
    .setMaxLength(100);

  // Image URL input (optional)
  const imageInput = new TextInputBuilder()
    .setCustomId('flowerImage')
    .setLabel('Image URL (Optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Upload your photo or any image you like (e.g., a dog, graphic, etc.)')
    .setRequired(false)
    .setMaxLength(500);

  // Add inputs to modal
  const messageRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
    messageInput,
  );
  const nameRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(nameInput);
  const imageRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(imageInput);

  modal.addComponents(messageRow, nameRow, imageRow);

  // Show the modal
  await interaction.showModal(modal);
}

export async function handleFlowerModalSubmit(interaction: ModalSubmitInteraction) {
  // Get form inputs
  const message = interaction.fields.getTextInputValue('flowerMessage');
  const name = interaction.fields.getTextInputValue('flowerName') || 'Anonymous';
  const imageUrl = interaction.fields.getTextInputValue('flowerImage') || null;

  // Validate content
  if (containsInappropriateContent(message) || containsInappropriateContent(name)) {
    await interaction.reply({
      content:
        '❌ Your submission contains inappropriate language. Please keep your message positive and respectful.',
      ephemeral: true,
    });
    return;
  }

  // Validate image URL if provided
  if (imageUrl) {
    try {
      const url = new URL(imageUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        await interaction.reply({
          content: '❌ Please provide a valid HTTP or HTTPS image URL.',
          ephemeral: true,
        });
        return;
      }
    } catch {
      await interaction.reply({
        content: '❌ Please provide a valid image URL.',
        ephemeral: true,
      });
      return;
    }
  }

  // Create embed for the flower submission
  const embed = new EmbedBuilder()
    .setColor('#FF69B4') // Pink color for flowers
    .setTitle('🌸 New Flower Submission 💐')
    .setDescription(message)
    .addFields({ name: 'Submitted by', value: name, inline: true })
    .setFooter({
      text: 'By submitting, you agree to be featured on the BobaTalks website • Thank you for celebrating with us!',
    })
    .setTimestamp();

  // Add image if provided
  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  // Send to channel
  try {
    await interaction.reply({
      content:
        '✅ Your flower has been submitted! Thank you for sharing and celebrating with the community! 🌸',
      ephemeral: true,
    });

    // Post the flower to the channel
    if (interaction.channel && 'send' in interaction.channel) {
      await interaction.channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Error submitting flower:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred while submitting your flower. Please try again.',
        ephemeral: true,
      });
    }
  }
}
