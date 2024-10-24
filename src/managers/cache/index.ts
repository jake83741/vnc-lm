import { CacheManager } from './manager';
import { CacheStore, cacheStore } from './store';
export * from './types';
export { CacheStore, cacheStore } from './store';
export { CacheManager } from './manager';

// Export functions directly from manager
export const initializeCache = CacheManager.initializeCache;
export const restoreMessageDataFromCache = CacheManager.restoreMessageDataFromCache;
export const createNewConversation = CacheManager.createNewConversation;
export const updateMessageCache = CacheManager.updateMessageCache;
export const getActiveChannel = CacheManager.getActiveChannel;
export const setActiveChannel = CacheManager.setActiveChannel;

// Export bound methods from cacheStore
export const getState = () => cacheStore.getState();
export const updateState = (state: Parameters<typeof cacheStore.updateState>[0]) => cacheStore.updateState(state);
export const messageDataMap = CacheStore.getInstance().messageDataMap;