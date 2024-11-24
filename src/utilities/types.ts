// utilities/types.ts

// LiteLLM and Base Client Types
export interface ChatMessage {
  role: string;
  content: string | MessageContent[];
  attachments?: Array<{
      type: 'text' | 'image';
      name: string;
      content: string;
  }>;
}

export interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
      url: string;
      detail?: 'low' | 'high';
  };
}

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

// Existing Model Types
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

// Ollama Specific Types
export interface OllamaRequestOptions {
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

// Cache Types
export interface MessageData {
  content: string;
  isUserMessage: boolean;
  pages?: string[];
  modelName?: string;
  currentPageIndex?: number;
  attachments?: Array<{
      type: 'text' | 'image';
      name: string;
      content: string;
  }>;
}

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

// Type Guards
export function isValidConversation(conv: any): conv is Conversation {
  return (
      typeof conv === 'object' &&
      conv !== null &&
      Array.isArray(conv.messages) &&
      typeof conv.id === 'string'
  );
}

// Response Types
export interface StreamResponse {
  response: string;
  context?: string;
  done: boolean;
  isCancelled?: boolean;
}

// LiteLLM Proxy Specific Types
export interface LiteLLMResponse {
  choices: Array<{
      delta: {
          content?: string;
      };
      message?: {
          content: string;
      };
  }>;
}

export type { Readable } from 'stream';