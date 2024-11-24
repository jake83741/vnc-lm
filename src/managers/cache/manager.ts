import { Client, Channel } from 'discord.js';
import { MessageData, Conversation, CachedMessageData } from '../../utilities/types';
import { cacheStore } from './store';
import { setupGlobalMessageCollector } from '../generation/messages';
import { chatBot } from '../../utilities';
import { ClientFactory } from '../../api-connections/factory';

class CacheManagerImpl {
    private static instance: CacheManagerImpl | null = null;
    private messageBuffer: Map<string, MessageData> = new Map();
    private flushTimeout: NodeJS.Timeout | null = null;
    private flushInterval: NodeJS.Timeout | null = null;
    private isInitialized = false;

    private constructor() {} // Private constructor for singleton

    public static getInstance(): CacheManagerImpl {
        if (!CacheManagerImpl.instance) {
            CacheManagerImpl.instance = new CacheManagerImpl();
        }
        return CacheManagerImpl.instance;
    }

    private async flushMessageBuffer(): Promise<void> {
        if (this.messageBuffer.size === 0) return;

        const entries = Array.from(this.messageBuffer.entries());
        this.messageBuffer.clear();

        try {
            for (let i = 0; i < entries.length; i += 50) {
                const batch = entries.slice(i, i + 50);
                batch.forEach(([messageId, data]) => {
                    cacheStore.messageDataMap.set(messageId, data);
                });
            }
            await cacheStore.saveCache();
        } catch (error) {
            console.error('Error flushing message buffer:', error);
            entries.forEach(([id, data]) => this.messageBuffer.set(id, data));
            throw error;
        }
    }

    public initialize(): void {
        if (this.isInitialized) {
            return;
        }

        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }

        this.flushInterval = setInterval(() => {
            if (this.messageBuffer.size > 0) {
                void this.flushMessageBuffer().catch(console.error);
            }
        }, 1000);

        this.isInitialized = true;
    }

    public cleanup(): void {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        if (this.flushTimeout) {
            clearTimeout(this.flushTimeout);
            this.flushTimeout = null;
        }
        this.messageBuffer.clear();
        this.isInitialized = false;
    }

    private async restoreModel(channelId: string, currentConversationId: string): Promise<void> {
        const conversation = cacheStore.cache.conversations[currentConversationId] as Conversation;
        if (!conversation) return;
    
        const lastBotMessage = [...conversation.messages]
            .reverse()
            .find(msg => !msg.data.isUserMessage && msg.data.modelName);
    
        if (lastBotMessage?.data.modelName) {
            const modelName = lastBotMessage.data.modelName;
    
            chatBot.modelName = modelName;
            const client = ClientFactory.getClient(modelName);
            client.modelName = modelName;
    
            if (conversation.systemPrompt !== undefined) {
                client.setSystem(conversation.systemPrompt);
                chatBot.system = conversation.systemPrompt;
            } else {
                client.clearSystem();
                chatBot.system = null;
            }
    
            const history = conversation.messages.map(msg => ({
                role: msg.data.isUserMessage ? 'user' : 'assistant',
                content: msg.data.content
            }));
            client.setConversationHistory(history);
            chatBot.setConversationHistory(history);
    
            cacheStore.updateState({ 
                lastUsedModel: modelName,
                activeChannel: channelId
            });
        }
    }

    public async restoreMessages(client: Client): Promise<void> {
        const activeChannelId = cacheStore.getState().activeChannel;
        if (!activeChannelId) return;
    
        const conversations = Object.entries(cacheStore.cache.conversations);
        const activeMessages = conversations.flatMap(([_, conv]) => {
            const typedConv = conv as Conversation;
            return typedConv.messages.filter(item => item.channelId === activeChannelId);
        });
    
        const messagePromises = activeMessages.map(async item => {
            try {
                const channel = await client.channels.fetch(item.channelId);
                if (!channel?.isTextBased()) return;
    
                const message = await channel.messages.fetch(item.messageId)
                    .catch(() => null);
                
                if (message) {
                    cacheStore.messageDataMap.set(message.id, item.data);
                }
            } catch {
                return;
            }
        });
    
        for (let i = 0; i < messagePromises.length; i += 50) {
            await Promise.all(messagePromises.slice(i, i + 50));
        }
    
        const state = cacheStore.getState();
        if (state.currentConversationId) {
            await this.restoreModel(activeChannelId, state.currentConversationId);
        }
    }

    public getConversations(): { [id: string]: Conversation } {
        const activeChannelId = cacheStore.getState().activeChannel;
        if (!activeChannelId) return {};

        return Object.entries(cacheStore.cache.conversations).reduce((filtered, [id, conv]) => {
            const typedConv = conv as Conversation;
            const messages = typedConv.messages.filter(msg => msg.channelId === activeChannelId);
            if (messages.length > 0) {
                filtered[id] = { ...typedConv, messages };
            }
            return filtered;
        }, {} as { [id: string]: Conversation });
    }

    public createConversation(systemPrompt?: string | null): string {
        const state = cacheStore.getState();
        const conversationId = `conv-${(++state.conversationCounter).toString().padStart(4, '0')}`;
        
        cacheStore.cache.conversations[conversationId] = {
            id: conversationId,
            startTimestamp: Date.now(),
            messages: [],
            systemPrompt: systemPrompt || null
        };
        
        cacheStore.updateState({ 
            currentConversationId: conversationId,
            conversationCounter: state.conversationCounter
        });
        
        return conversationId;
    }

    public updateMessage(
        messageId: string,
        channelId: string,
        content: string,
        isUserMessage: boolean,
        additionalData: Partial<MessageData> = {}
    ): void {
        const state = cacheStore.getState();
        const currentConversationId = state.currentConversationId;
        const activeChannelId = state.activeChannel;
    
        if (!activeChannelId || channelId !== activeChannelId || !currentConversationId) return;
    
        const conversation = cacheStore.cache.conversations[currentConversationId] as Conversation;
        if (!conversation) return;
    
        const messageData = {
            content,
            isUserMessage,
            ...additionalData,
            attachments: additionalData.attachments || []
        };
    
        this.messageBuffer.set(messageId, messageData);
    
        if (!this.flushTimeout) {
            this.flushTimeout = setTimeout(() => {
                this.flushTimeout = null;
                void this.flushMessageBuffer().catch(console.error);
            }, 1000);
        }
    
        const existingIndex = conversation.messages.findIndex(msg => msg.messageId === messageId);
        if (existingIndex !== -1) {
            conversation.messages[existingIndex].data = messageData;
        } else {
            conversation.messages.push({
                messageId,
                channelId,
                data: messageData
            });
            cacheStore.updateState({ 
                messageCount: state.messageCount + 1 
            });
        }
    }

    public deleteMessage(messageId: string, channelId: string): void {
        const state = cacheStore.getState();
        const currentConversationId = state.currentConversationId;
        if (!currentConversationId) return;
    
        const conversation = cacheStore.cache.conversations[currentConversationId] as Conversation;
        if (!conversation) return;
    
        const messageIndex = conversation.messages.findIndex(msg => 
            msg.messageId === messageId && msg.channelId === channelId
        );
    
        if (messageIndex !== -1) {
            const deletedContent = conversation.messages[messageIndex].data.content;
    
            if (messageIndex < conversation.messages.length - 1 && 
                !conversation.messages[messageIndex + 1].data.isUserMessage) {
                const botMessageId = conversation.messages[messageIndex + 1].messageId;
                cacheStore.messageDataMap.delete(botMessageId);
                this.messageBuffer.delete(botMessageId);
                conversation.messages.splice(messageIndex, 2);
            } else {
                conversation.messages.splice(messageIndex, 1);
            }
    
            if (chatBot.modelName) {
                const client = ClientFactory.getClient(chatBot.modelName);
                client.removeFromHistory(deletedContent);
            }
    
            cacheStore.messageDataMap.delete(messageId);
            this.messageBuffer.delete(messageId);
            
            cacheStore.saveCache().catch(err => 
                console.error('Error saving cache:', err)
            );
        }
    }

    public getActiveChannel(): Channel | null {
        const activeChannelId = cacheStore.getState().activeChannel;
        return activeChannelId ? { id: activeChannelId } as Channel : null;
    }

    public async setActiveChannel(channel: Channel | null): Promise<void> {
        if (!channel) {
            cacheStore.updateState({ 
                activeChannel: null,
                currentConversationId: null 
            });
            return;
        }
    
        if ('isThread' in channel && channel.isThread()) {
            const conversations = Object.values(cacheStore.cache.conversations);
            const threadConversation = conversations.find(conv => {
                const typedConv = conv as Conversation;
                return typedConv.messages.some(msg => msg.channelId === channel.id);
            });
    
            if (threadConversation) {
                await this.restoreModel(channel.id, threadConversation.id);
                
                cacheStore.updateState({ 
                    activeChannel: channel.id,
                    currentConversationId: threadConversation.id
                });
                
                setupGlobalMessageCollector(channel.client, cacheStore.messageDataMap);
                return;
            }
        }
    
        const newConversationId = this.createConversation();
        cacheStore.updateState({ 
            activeChannel: channel.id,
            currentConversationId: newConversationId
        });
        
        setupGlobalMessageCollector(channel.client, cacheStore.messageDataMap);
    }
}

// Create and export the singleton instance
export const cacheManager = CacheManagerImpl.getInstance();

// Export the same interface functions but use the singleton
export const initializeCache = (): void => cacheManager.initialize();
export const restoreMessageDataFromCache = async (client: Client): Promise<void> => 
    await cacheManager.restoreMessages(client);
export const createNewConversation = (systemPrompt?: string | null): string => 
    cacheManager.createConversation(systemPrompt);
export const updateMessageCache = (messageId: string, channelId: string, content: string, isUserMessage: boolean, additionalData?: Partial<MessageData>): void => 
    cacheManager.updateMessage(messageId, channelId, content, isUserMessage, additionalData);
export const deleteMessageFromCache = (messageId: string, channelId: string): void => 
    cacheManager.deleteMessage(messageId, channelId);
export const getActiveChannel = (): Channel | null => cacheManager.getActiveChannel();
export const setActiveChannel = async (channel: Channel | null): Promise<void> => 
    await cacheManager.setActiveChannel(channel);

// Keep the same error handlers
process.on('uncaughtException', (error) => {
    cacheManager.cleanup();
    cacheManager.initialize();
});

process.on('SIGINT', () => {
    cacheManager.cleanup();
    process.exit(0);
});