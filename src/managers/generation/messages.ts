import { Client, Interaction, Message, PartialMessage } from 'discord.js';
import { MessageData, Conversation, CachedMessageData } from '../../utilities/types';
import { cacheStore, updateMessageCache } from '../../utilities';
import { updatePageEmbed, createPageButtons } from './pages';

// Export messageDataMap at the top
export const messageDataMap = new Map<string, MessageData>();

export function setupGlobalMessageCollector(client: Client, messageDataMap: Map<string, MessageData>) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isButton()) return;
    
    const message = interaction.message as Message;
    
    let currentData = null;
    const conversations = Object.values(cacheStore.cache.conversations);
    for (const conv of conversations) {
        const typedConv = conv as Conversation;
        const cachedMsg = typedConv.messages.find((msg: CachedMessageData) => msg.messageId === message.id);
        if (cachedMsg) {
            currentData = { ...cachedMsg.data }; // Create a copy
            break;
        }
    }

    if (!currentData?.pages || !Array.isArray(currentData.pages)) {
        console.error('Invalid pages array:', currentData?.pages);
        return;
    }

    const { customId } = interaction;
    currentData.currentPageIndex = currentData.currentPageIndex ?? 0;

    let nextIndex = currentData.currentPageIndex;
    if (customId === 'previous') {
        nextIndex = Math.max(0, currentData.currentPageIndex - 1);
    } else if (customId === 'next') {
        nextIndex = Math.min(currentData.pages.length - 1, currentData.currentPageIndex + 1);
    }

    if (nextIndex !== currentData.currentPageIndex) {
        currentData.currentPageIndex = nextIndex;
        const updatedEmbed = updatePageEmbed(currentData, true);
        const updatedRow = createPageButtons(currentData);

        let updateSuccessful = false;
        try {
            await interaction.update({ embeds: [updatedEmbed], components: [updatedRow] });
            updateSuccessful = true;
        } catch (error: any) {
            if (error.code === 40060) {
                // Silently ignore already acknowledged interactions
                updateSuccessful = true;
            } else {
                try {
                    await message.edit({ embeds: [updatedEmbed], components: [updatedRow] });
                    updateSuccessful = true;
                } catch (editError: any) {
                    if (editError.code !== 40060) {
                        console.error('Failed to edit message:', editError);
                    }
                }
            }
        }

        if (updateSuccessful) {
            messageDataMap.set(message.id, currentData);
            let cacheUpdated = false;
            for (const conversation of conversations) {
                const typedConv = conversation as Conversation;
                const cachedMessage = typedConv.messages.find((msg: CachedMessageData) => msg.messageId === message.id);
                if (cachedMessage) {
                    cachedMessage.data = { ...currentData };
                    cacheStore.saveCache();
                    cacheUpdated = true;
                    break;
                }
            }
        }
    }
});

  client.on('messageCreate', (message: Message) => {
    if (!message.author.bot) {
      const activeChannel = cacheStore.getState().activeChannel;
      if (activeChannel && message.channelId === activeChannel) {
        updateMessageCache(message.id, message.channelId, message.content, true);
      }
    }
  });

  client.on('messageDelete', async (message: Message | PartialMessage) => {
    try {
      if (message.channel?.isThread()) {
        const state = cacheStore.getState();
        if (state.currentConversationId) {
          const conversation = cacheStore.cache.conversations[state.currentConversationId] as Conversation;
          if (conversation && conversation.messages) {
            const messageIndex = conversation.messages.findIndex((msg: CachedMessageData) => msg.messageId === message.id);
            if (messageIndex !== -1) {
              const deletedContent = conversation.messages[messageIndex].data.content;
              conversation.messages.splice(messageIndex, 1);
              cacheStore.saveCache();

              if (message.client.user && message.mentions?.has(message.client.user)) {
                const nextMessage = conversation.messages[messageIndex];
                if (nextMessage && !nextMessage.data.isUserMessage) {
                  const botMessage = await message.channel.messages.fetch(nextMessage.messageId)
                    .catch(() => null);
                  if (botMessage) {
                    await botMessage.delete().catch(console.error);
                    conversation.messages.splice(messageIndex, 1);
                    cacheStore.saveCache();
                  }
                }
              }
            }
          }
        }
        messageDataMap.delete(message.id);
      }
    } catch (error) {
      console.error('Error handling message deletion:', error);
    }
  });
}

export function handleNewMessage(message: Message, messageData: MessageData) {
  if (!message.author.bot) {
    const activeChannel = cacheStore.getState().activeChannel;
    if (activeChannel && message.channelId === activeChannel) {
      updateMessageCache(
        message.id,
        message.channelId,
        message.content,
        true,
        messageData
      );
    }
  }
}

export function handleMessageDeletion(messageId: string, channelId: string) {
  const state = cacheStore.getState();
  if (state.currentConversationId) {
    const conversation = cacheStore.cache.conversations[state.currentConversationId] as Conversation;
    if (conversation && conversation.messages) {
      const messageIndex = conversation.messages.findIndex((msg: CachedMessageData) => 
        msg.messageId === messageId && msg.channelId === channelId
      );
      if (messageIndex !== -1) {
        conversation.messages.splice(messageIndex, 1);
        cacheStore.saveCache();
      }
    }
  }
  messageDataMap.delete(messageId);
}

export function updateMessageHistory(
  messageId: string,
  channelId: string,
  content: string,
  isUserMessage: boolean,
  additionalData: Partial<MessageData> = {}
) {
  const data: MessageData = {
    content,
    isUserMessage,
    ...additionalData
  };
  
  updateMessageCache(messageId, channelId, content, isUserMessage, data);
  return data;
}

export interface MessageManager {
  setupCollector: typeof setupGlobalMessageCollector;
  handleNew: typeof handleNewMessage;
  handleDeletion: typeof handleMessageDeletion;
  updateHistory: typeof updateMessageHistory;
}

export const messageManager: MessageManager = {
  setupCollector: setupGlobalMessageCollector,
  handleNew: handleNewMessage,
  handleDeletion: handleMessageDeletion,
  updateHistory: updateMessageHistory
};