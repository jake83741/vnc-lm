import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Interaction, Message } from 'discord.js';
import { MessageData, updateMessageCache, getActiveChannel } from '../cache';

export const setupGlobalMessageCollector = (client: Client, messageDataMap: Map<string, MessageData>) => {
  // Event listener for button interactions
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isButton()) return; // Ignore non-button interactions
    
    const message = interaction.message as Message;
    const currentData = messageDataMap.get(message.id);
    if (!currentData?.pages) return; // Ignore if no page data exists for this message

    const { customId } = interaction;
    const { currentPageIndex, pages } = currentData;

    // Check if the interaction is for navigating pages
    if ((customId === 'previous' && currentPageIndex! > 0) || 
        (customId === 'next' && currentPageIndex! < pages.length - 1)) {
      // Update the current page index
      currentData.currentPageIndex = customId === 'previous' ? currentPageIndex! - 1 : currentPageIndex! + 1;

      // Create updated embed with new page content
      const updatedEmbed = new EmbedBuilder()
        .setDescription(pages[currentData.currentPageIndex!])
        .setFooter({ text: currentData.modelName || '' });
      
      // Create updated action row with navigation buttons
      const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('previous')
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentData.currentPageIndex === 0), // Disable 'Previous' button on first page
        new ButtonBuilder()
          .setCustomId('next')
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentData.currentPageIndex === pages.length - 1) // Disable 'Next' button on last page
      );

      // Update the message with new embed and buttons
      await interaction.update({ embeds: [updatedEmbed], components: [updatedRow] });
      
      // Check if message is from active channel before updating cache
      const activeChannel = getActiveChannel();
      if (activeChannel && message.channelId === activeChannel.id) {
        // Update the message data in the map and cache
        messageDataMap.set(message.id, currentData);
        updateMessageCache(message.id, message.channelId, currentData.content, false, currentData);
      }
    }
  });

  // Event listener for new messages
  client.on('messageCreate', (message: Message) => {
    if (!message.author.bot) {
      // Check if message is from active channel before caching
      const activeChannel = getActiveChannel();
      if (activeChannel && message.channelId === activeChannel.id) {
        // Update cache for non-bot messages from active channel
        updateMessageCache(message.id, message.channelId, message.content, true);
      }
    }
  });
};