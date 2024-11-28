import { Client, Interaction, Message, PartialMessage } from 'discord.js';
import { MessageData, Conversation, CachedMessageData } from '../../utilities/types';
import { cacheStore, updateMessageCache } from '../../utilities';
import { createPageEmbed, createPageButtons } from './pages';

// Export messageDataMap at the top
export const messageDataMap = new Map<string, MessageData>();
const pageUpdateLocks = new Map<string, boolean>();

export function setupGlobalMessageCollector(client: Client, messageDataMap: Map<string, MessageData>) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isButton()) return;
    
    const message = interaction.message as Message;
    
    // Use Map instead of globalThis for the lock
    const updateLock = `page_update_${message.id}`;
    if (pageUpdateLocks.get(updateLock)) return;
    pageUpdateLocks.set(updateLock, true);

    try {
        let currentData = null;
        const conversations = Object.values(cacheStore.cache.conversations);
        for (const conv of conversations) {
            const typedConv = conv as Conversation;
            const cachedMsg = typedConv.messages.find((msg: CachedMessageData) => 
                msg.messageId === message.id
            );
            if (cachedMsg) {
                currentData = { ...cachedMsg.data };
                break;
            }
        }

        if (!currentData?.pages || !Array.isArray(currentData.pages)) {
            return;
        }

        const { customId } = interaction;
        const currentIndex = currentData.currentPageIndex ?? 0;
        let nextIndex = currentIndex;

        if (customId === 'previous') {
            nextIndex = Math.max(0, currentIndex - 1);
        } else if (customId === 'next') {
            nextIndex = Math.min(currentData.pages.length - 1, currentIndex + 1);
        }

        if (nextIndex !== currentIndex) {
            currentData.currentPageIndex = nextIndex;
            const updatedEmbed = createPageEmbed(currentData, true);
            const updatedRow = createPageButtons(currentData);

            await interaction.update({ 
                embeds: [updatedEmbed], 
                components: [updatedRow] 
            });

            messageDataMap.set(message.id, { ...currentData });
            
            for (const conversation of conversations) {
                const typedConv = conversation as Conversation;
                const cachedMessage = typedConv.messages.find(msg => 
                    msg.messageId === message.id
                );
                if (cachedMessage) {
                    cachedMessage.data = { ...currentData };
                    await cacheStore.saveCache();
                    break;
                }
            }
        }
    } catch (error) {
        console.error('Error updating page:', error);
    } finally {
        // Release the lock using Map
        pageUpdateLocks.delete(updateLock);
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
