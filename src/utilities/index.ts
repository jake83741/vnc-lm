// utilities/index.ts

// First import external dependencies
import { Readable } from "stream";
import { Channel } from "discord.js";

// Then import settings which has minimal dependencies
export * from "./settings";

// Define core types that don't depend on other modules
export interface ChatMessage {
  role: string;
  content: string | MessageContent[];
  attachments?: Array<{
    type: "text" | "image";
    name: string;
    content: string;
  }>;
}

export interface MessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "low" | "high";
  };
}

export interface MessageData {
  content: string;
  isUserMessage: boolean;
  pages?: string[];
  modelName?: string;
  currentPageIndex?: number;
  attachments?: Array<{
    type: "text" | "image";
    name: string;
    content: string;
  }>;
}

// Import and re-export cache-related functionality
export { cacheStore, getState, updateState } from "../managers/cache/store";

export {
  initializeCache,
  restoreMessageDataFromCache,
  createNewConversation,
  updateMessageCache,
  deleteMessageFromCache,
  getActiveChannel,
  setActiveChannel,
} from "../managers/cache/manager";

// Import and re-export message handling
export { messageDataMap } from "../managers/generation/core";

// Import and re-export API clients
export { BaseClient } from "../api-connections/base-client";
export {
  OllamaClient,
  defaultClient as chatBot,
} from "../api-connections/provider/ollama/client";
export { LiteLLMClient } from "../api-connections/provider/litellm/client";
export { ClientFactory } from "../api-connections/factory";

// Import and re-export model management
import { ModelManager } from "../commands/handlers";

// Create and export model manager instance
const modelManager = new ModelManager();
export const defaultModelManager = modelManager;

// Export request/response types
export interface BaseRequestOptions {
  model: string;
  prompt: string;
  system?: string | null;
  context?: string | null;
  temperature?: number;
  options?: {
    num_ctx?: number;
    keep_alive?: string;
  };
  images?: string[];
  cachedMessages?: ChatMessage[];
}

export interface ModelInfo {
  name: string;
}

export interface ModelDirectories {
  [key: string]: string;
}

export interface ModelOption {
  name: string;
  value: string;
}

export interface OllamaRequestOptions extends BaseRequestOptions {}

export interface OllamaResponse {
  response: string;
  context?: string;
  done: boolean;
}

export interface PullResponse {
  status: string;
  completed?: number;
  total?: number;
}

export interface ApiResponse {
  models: ModelInfo[];
}

// Cache-related types
export interface CachedMessageData {
  messageId: string;
  channelId: string;
  data: MessageData;
  isSummary?: boolean;
}

export interface Conversation {
  id: string;
  startTimestamp: number;
  messages: CachedMessageData[];
  systemPrompt?: string | null;
}

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

export interface CacheData {
  conversations: { [id: string]: Conversation };
  state: BotState;
}

// Type guard functions
export function isValidConversation(conv: any): conv is Conversation {
  return (
    typeof conv === "object" &&
    conv !== null &&
    Array.isArray(conv.messages) &&
    typeof conv.id === "string"
  );
}

// Export types used by external modules
export type { Readable };

export { useWebSearch, toggleWebSearch } from './settings';