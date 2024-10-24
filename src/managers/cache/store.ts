import fs from 'fs';
import { CacheData, MessageData, Conversation, BotState } from './types';

const CACHE_FILE = 'bot_cache.json';

export class CacheStore {
  private static instance: CacheStore;
  public cache: CacheData;
  public messageDataMap: Map<string, MessageData>;

  private constructor() {
    this.messageDataMap = new Map<string, MessageData>();
    this.cache = {
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
    this.loadCache();
  }

  public static getInstance(): CacheStore {
    if (!CacheStore.instance) {
      CacheStore.instance = new CacheStore();
    }
    return CacheStore.instance;
  }

  private loadCache(): void {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const data = fs.readFileSync(CACHE_FILE, 'utf8');
        if (data.trim()) {
          const loadedCache = JSON.parse(data);
          if (Array.isArray(loadedCache.conversations)) {
            loadedCache.conversations = Object.fromEntries(
              loadedCache.conversations.map((conv: Conversation) => [conv.id, conv])
            );
          }
          this.cache = loadedCache;
          this.cache.state.conversationCounter = 
            this.cache.state.conversationCounter || Object.keys(this.cache.conversations).length;
        }
      }
    } catch (error) {
      console.error('Error loading cache:', error);
    }
  }

  public saveCache(): void {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2));
  }

  public getConversations(): { [id: string]: Conversation } {
    return this.cache.conversations;
  }

  public getState(): BotState {
    return this.cache.state;
  }

  public updateState(newState: Partial<BotState>): void {
    Object.assign(this.cache.state, newState);
    this.saveCache();
  }
}

export const cacheStore = CacheStore.getInstance();