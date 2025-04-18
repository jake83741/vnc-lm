import fs from "fs";
import {
  CacheData,
  MessageData,
  Conversation,
  BotState,
} from "../../utilities/index";

const CACHE_FILE = "bot_cache.json";
const SAVE_DELAY = 1000; // 1 second debounce for saves
const MAX_RETRIES = 3;
const RETRY_DELAY = 500; // 500ms between retries

export class CacheStore {
  private static instance: CacheStore;
  public cache: CacheData;
  public messageDataMap: Map<string, MessageData>;
  private saveTimeout: NodeJS.Timeout | null = null;
  private isSaving = false;

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
        conversationCounter: 0,
      },
    };
    this.loadCache();
  }

  public static getInstance(): CacheStore {
    if (!CacheStore.instance) {
      CacheStore.instance = new CacheStore();
    }
    return CacheStore.instance;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retries = MAX_RETRIES
  ): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === retries - 1) throw error;
        await this.delay(RETRY_DELAY);
      }
    }
    throw new Error("Operation failed after maximum retries");
  }

  private async loadCache(): Promise<void> {
    try {
      if (!fs.existsSync(CACHE_FILE)) {
        console.log("No cache file found to import");
        console.log("Created empty bot_cache.json");
        await this.saveCache();
        return;
      }

      const data = await fs.promises.readFile(CACHE_FILE, "utf8");
      if (!data.trim()) {
        return;
      }

      const loadedCache = JSON.parse(data);

      if (Array.isArray(loadedCache.conversations)) {
        loadedCache.conversations = Object.fromEntries(
          loadedCache.conversations.map((conv: Conversation) => [conv.id, conv])
        );
      }

      this.cache = {
        conversations: loadedCache.conversations || {},
        state: {
          ...this.cache.state,
          ...loadedCache.state,
          conversationCounter:
            loadedCache.state?.conversationCounter ||
            Object.keys(loadedCache.conversations || {}).length,
        },
      };
    } catch (error) {
      console.error("Error loading cache:", error);
      // Keep using existing empty cache as fallback
    }
  }

  public async saveCache(): Promise<void> {
    if (this.isSaving) return;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      this.isSaving = true;
      try {
        await this.retryOperation(async () => {
          const tempFile = `${CACHE_FILE}.tmp`;
          await fs.promises.writeFile(
            tempFile,
            JSON.stringify(this.cache, null, 2)
          );
          await fs.promises.rename(tempFile, CACHE_FILE);
        });
      } catch (error) {
        console.error("Failed to save cache:", error);
      } finally {
        this.isSaving = false;
        this.saveTimeout = null;
      }
    }, SAVE_DELAY);
  }

  public getState(): BotState {
    return this.cache.state;
  }

  public async updateState(newState: Partial<BotState>): Promise<void> {
    Object.assign(this.cache.state, newState);
    await this.saveCache();
  }

  public async cleanup(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    await this.saveCache();
    this.messageDataMap.clear();
  }
}

export const cacheStore = CacheStore.getInstance();
export const getState = () => cacheStore.getState();
export const updateState = (state: Partial<BotState>) =>
  cacheStore.updateState(state);

// Cleanup on process exit
process.on("SIGINT", async () => {
  await cacheStore.cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cacheStore.cleanup();
  process.exit(0);
});