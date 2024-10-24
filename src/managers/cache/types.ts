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

export interface Conversation {
  id: string;
  startTimestamp: number;
  messages: CachedMessageData[];
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

export function isValidConversation(conv: any): conv is Conversation {
  return (
    typeof conv === 'object' &&
    conv !== null &&
    Array.isArray(conv.messages) &&
    typeof conv.id === 'string'
  );
}