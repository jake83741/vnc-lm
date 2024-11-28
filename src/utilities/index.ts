// utilities/index.ts

import { ModelManager } from '../commands/loading-comand';

// Core utilities exports 
export * from './settings';
export * from './types';

// Cache management exports
export { 
    cacheStore, 
    getState, 
    updateState 
} from '../managers/cache/store';

export { 
    initializeCache,
    restoreMessageDataFromCache,
    createNewConversation,
    updateMessageCache,
    deleteMessageFromCache,
    getActiveChannel,
    setActiveChannel
} from '../managers/cache/manager';

// Message handling exports
export { messageDataMap } from '../managers/generation/messages';

// API client exports
export { BaseClient } from '../api-connections/base-client';
export { OllamaClient, defaultClient, chatBot } from '../api-connections/provider/ollama/client';
export { LiteLLMClient } from '../api-connections/provider/litellm/client';
export { ClientFactory } from '../api-connections/factory';

// Model management exports
export { ModelManager, BaseModelManager } from '../commands/loading-comand';

// Create and export model manager instance
const modelManager = new ModelManager();
export const defaultModelManager = modelManager;