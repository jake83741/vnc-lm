import { Message, TextChannel, DMChannel, NewsChannel, ThreadChannel, MessageCreateOptions, MessagePayload, MessageEditOptions } from 'discord.js';
import { BotSettings, chatBot, apiResponseUpdateFrequency } from '../../utilities';
import { MessageData, updateMessageCache, messageDataMap } from '../../managers/cache';
import { addToPages, createPageEmbed, createPageButtons } from '../../managers//pages/manager';

// Type guard to check if a channel is text-based and has a 'send' method
function isTextBasedChannel(channel: any): channel is TextChannel | DMChannel | NewsChannel | ThreadChannel {
  return channel.isTextBased() && 'send' in channel;
}

export async function handleResponseStream(responseStream: any, message: Message, initialMessageData: MessageData) {
  let responseMessage: Message | undefined, isComplete = false;
  const messageData = initialMessageData;

  // Function to update the response message with current data
  const updateMessage = async () => {
    const embed = createPageEmbed(messageData, isComplete);
    const row = createPageButtons(messageData);
    const messageOptions: MessageCreateOptions & MessageEditOptions = { embeds: [embed], components: [row] };
    try {
      if (!responseMessage) {
        // If no response message exists, create a new one
        responseMessage = await message.reply(messageOptions);
        responseMessage && messageDataMap.set(responseMessage.id, messageData);
      } else {
        // If response message exists, edit it
        await responseMessage.edit(messageOptions as MessagePayload | MessageEditOptions);
      }
    } catch (error: any) {
      console.error('Error updating message:', error);
      // If error is due to message length, send a new message in the channel
      if (error?.code === 50035 && isTextBasedChannel(message.channel)) {
        responseMessage = await message.channel.send(messageOptions);
      }
    }
  };

  let apiResponseCount = 0;
  responseStream.on('data', async (chunk: Buffer) => {
    // Process each line of the chunk
    chunk.toString('utf8').split('\n').filter(line => line.trim()).forEach(async jsonString => {
      try {
        const { response: content, context } = JSON.parse(jsonString);
        if (content) {
          addToPages(messageData, content);
          messageData.content += content;
          // Update message after a certain number of API responses
          if (++apiResponseCount === apiResponseUpdateFrequency) {
            await updateMessage();
            apiResponseCount = 0;
          }
        }
        context && (chatBot.context = context);
      } catch (error) {
        // Silently ignore JSON parsing errors
      }
    });
  });

  responseStream.on('end', async () => {
    try {
      isComplete = true;
      messageData.currentPageIndex = 0;
      await updateMessage();
      // Update message cache when stream ends
      responseMessage && updateMessageCache(responseMessage.id, responseMessage.channelId, messageData.content, false, messageData);
    } catch (error) {
      console.error('Error updating response message:', error);
      if (isTextBasedChannel(message.channel)) {
        await message.channel.send('An error occurred while updating the response message.');
      }
    } finally {
      // Clear current request when done
      BotSettings.currentRequest = null;
    }
  });

  return responseMessage;
}