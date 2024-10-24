import { Client, Channel } from 'discord.js';
import { MessageData, Conversation } from './types';
import { cacheStore } from './store';

export class CacheManager {
  public static initializeCache(): void {
    console.log('Cache initialized.');
  }

  public static async restoreMessageDataFromCache(client: Client): Promise<void> {
    const activeChannelId = cacheStore.getState().activeChannel;
    if (!activeChannelId) return;

    for (const conversation of Object.values(cacheStore.getConversations())) {
      // Only restore messages from active channel
      const activeChannelMessages = conversation.messages.filter(item => 
        item.channelId === activeChannelId
      );

      for (const item of activeChannelMessages) {
        try {
          const channel = await client.channels.fetch(item.channelId);
          if (channel?.isTextBased()) {
            const message = await channel.messages.fetch(item.messageId);
            if (message) {
              cacheStore.messageDataMap.set(message.id, item.data);
            }
          }
        } catch (error) { /* Silently ignore errors when messages are not found */ }
      }
    }
  }

  public static getCurrentConversations(): { [id: string]: Conversation } {
    const activeChannelId = cacheStore.getState().activeChannel;
    if (!activeChannelId) return {};

    // Filter conversations to only include messages from active channel
    const filteredConversations: { [id: string]: Conversation } = {};
    
    for (const [id, conversation] of Object.entries(cacheStore.getConversations())) {
      const filteredMessages = conversation.messages.filter(msg => 
        msg.channelId === activeChannelId
      );
      
      if (filteredMessages.length > 0) {
        filteredConversations[id] = {
          ...conversation,
          messages: filteredMessages
        };
      }
    }

    return filteredConversations;
  }

  public static createNewConversation(): string {
    const state = cacheStore.getState();
    const conversationId = `conv-${(++state.conversationCounter).toString().padStart(4, '0')}`;
    
    cacheStore.cache.conversations[conversationId] = {
      id: conversationId,
      startTimestamp: Date.now(),
      messages: []
    };
    
    cacheStore.updateState({ 
      currentConversationId: conversationId,
      conversationCounter: state.conversationCounter
    });
    
    return conversationId;
  }

  public static updateMessageCache(
    messageId: string,
    channelId: string,
    content: string,
    isUserMessage: boolean,
    additionalData: Partial<MessageData> = {}
  ): void {
    const state = cacheStore.getState();
    const currentConversationId = state.currentConversationId;
    const activeChannelId = state.activeChannel;

    // Only cache messages from active channel
    if (!activeChannelId || channelId !== activeChannelId) return;
    if (!currentConversationId || !cacheStore.cache.conversations[currentConversationId]) return;
  
    const conversation = cacheStore.cache.conversations[currentConversationId];
    
    // Check if message already exists in the conversation
    const existingMessageIndex = conversation.messages.findIndex(msg => msg.messageId === messageId);
  
    const messageData = {
      messageId,
      channelId,
      data: { content, isUserMessage, ...additionalData }
    };
  
    if (existingMessageIndex !== -1) {
      // Update existing message instead of adding a new one
      conversation.messages[existingMessageIndex] = messageData;
    } else {
      // Add new message only if it doesn't exist
      conversation.messages.push(messageData);
      cacheStore.updateState({ 
        messageCount: cacheStore.getState().messageCount + 1 
      });
    }
  
    cacheStore.saveCache();
  }

  public static getActiveChannel(): Channel | null {
    const activeChannelId = cacheStore.getState().activeChannel;
    return activeChannelId ? { id: activeChannelId } as Channel : null;
  }

  public static setActiveChannel(channel: Channel | null): void {
    if (!channel) {
        cacheStore.updateState({ 
            activeChannel: null,
            currentConversationId: null 
        });
        return;
    }

    // When setting a new active channel, create a new conversation
    const newConversationId = CacheManager.createNewConversation();
    cacheStore.updateState({ 
        activeChannel: channel.id,
        currentConversationId: newConversationId
    });
  }
}