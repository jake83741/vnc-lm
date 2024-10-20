import fs from 'fs';
import { Channel } from 'discord.js';

// Define interfaces for message data and cached message data
export interface MessageData {
  content: string;
  isUserMessage: boolean;
  pages?: string[];
  modelName?: string;
  currentPageIndex?: number;
}

export interface CachedMessageData {
  messageId: string;
  channelId: string;
  data: MessageData;
}

// Define interface for a conversation
export interface Conversation {
  id: string;
  startTimestamp: number;
  messages: CachedMessageData[];
}

// Define interface for bot state
export interface BotState {
  lastKeepAlive: string | null;
  messageCount: number;
  lastUsedModel: string | null;
  lastSystemPrompt: string | null;
  lastTemperature: number | null;
  lastNumCtx: number | null;
  activeChannel: string | null;
  currentConversationId: string | null;
  restoredConversation: string | null;
  restoredInstructions: string | null;
  conversationCounter: number;
}

// Define interface for cache data
interface CacheData {
  conversations: { [id: string]: Conversation };
  state: BotState;
}

// Define cache file name
const CACHE_FILE = 'bot_cache.json';

// Initialize cache object with default values
let cache: CacheData = {
  conversations: {},
  state: {
    messageCount: 0,
    lastKeepAlive: null,
    lastUsedModel: null,
    lastSystemPrompt: null,
    lastTemperature: null,
    lastNumCtx: null,
    activeChannel: null,
    currentConversationId: null,
    restoredConversation: null,
    restoredInstructions: null,
    conversationCounter: 0
  }
};

// Create a map to store message data
export const messageDataMap = new Map<string, MessageData>();

// Function to save cache to file
const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

// Function to initialize cache from file or create new cache
export const initializeCache = () => {
  try {
    cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : cache;
    // Convert conversations array to object if necessary
    if (Array.isArray(cache.conversations)) {
      cache.conversations = Object.fromEntries(cache.conversations.map(conv => [conv.id, conv]));
    }
    // Initialize conversation counter
    cache.state.conversationCounter = cache.state.conversationCounter || Object.keys(cache.conversations).length;
    console.log('Cache initialized.');
  } catch (error) {
    // Error handling is empty
  }
};

// Function to create a new conversation
export const createNewConversation = (): string => {
  const conversationId = `conv-${(++cache.state.conversationCounter).toString().padStart(4, '0')}`;
  cache.conversations[conversationId] = { id: conversationId, startTimestamp: Date.now(), messages: [] };
  cache.state.currentConversationId = conversationId;
  saveCache();
  return conversationId;
};

// Function to update message cache
export const updateMessageCache = (messageId: string, channelId: string, content: string, isUserMessage: boolean, additionalData: Partial<MessageData> = {}) => {
  const currentConversationId = cache.state.currentConversationId;
  if (!currentConversationId || !cache.conversations[currentConversationId]) return;

  cache.conversations[currentConversationId].messages.push({
    messageId,
    channelId,
    data: { content, isUserMessage, ...additionalData }
  });
  cache.state.messageCount++;
  saveCache();
};

// Function to restore message data from cache
export const restoreMessageDataFromCache = async (client: any) => {
  for (const conversation of Object.values(cache.conversations)) {
    for (const item of conversation.messages) {
      try {
        const channel = await client.channels.fetch(item.channelId);
        if (channel?.isTextBased()) {
          const message = await channel.messages.fetch(item.messageId);
          if (message) messageDataMap.set(message.id, item.data);
        }
      } catch (error) { /* Silently ignore errors when messages are not found */ }
    }
  }
};

// Function to get bot state
export const getState = (): BotState => cache.state;

// Function to update bot state
export const updateState = (newState: Partial<BotState>): void => {
  Object.assign(cache.state, newState);
  saveCache();
};

// Function to get active channel
export const getActiveChannel = (): Channel | null => cache.state.activeChannel ? { id: cache.state.activeChannel } as Channel : null;

// Function to set active channel
export const setActiveChannel = (channel: Channel | null): void => updateState({ activeChannel: channel?.id || null });

// Function to get current conversation
export const getCurrentConversation = (): Conversation | null => 
  cache.state.currentConversationId ? cache.conversations[cache.state.currentConversationId] || null : null;

// Export cache object
export { cache };