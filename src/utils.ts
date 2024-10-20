import dotenv from 'dotenv';
import { AxiosResponse } from 'axios';
import { chatBot } from './api-connections/api-requests';
import { getState, updateState, setActiveChannel, BotState } from './managers/cache-manager';

// Load environment variables
dotenv.config();

export class BotSettings {
  // Default template name
  static templateName = "default";
  // Holds the current API request
  static currentRequest: Promise<AxiosResponse<any>> | null = null;

  static async initialize(client: any): Promise<void> {
    const state = getState();
    if (state.activeChannel) {
      try {
        // Attempt to fetch the previously active channel
        const channel = await client.channels.fetch(state.activeChannel);
        setActiveChannel(channel);
        if (channel && 'name' in channel) {
          console.log(`Resumed active channel: ${channel.name}`);
        }
      } catch (error) {
        console.log('Unable to fetch active channel. Setting to null.');
        setActiveChannel(null);
      }
    }
  
    if (state.lastUsedModel) {
      // Restore previous chat settings
      chatBot.modelName = state.lastUsedModel;
      chatBot.system = state.lastSystemPrompt || null;
      chatBot.temperature = state.lastTemperature || 0.4;
      chatBot.numCtx = state.lastNumCtx || defaultNumCtx;
      chatBot.keepAlive = state.lastKeepAlive || defaultKeepAlive;
    }
  }
}

// Environment variables
export const token = process.env.TOKEN;
export const ollamaUrl = process.env.OLLAMAURL;
export const defaultNumCtx = parseInt(process.env.NUM_CTX || '2048', 10);
export const defaultTemperature = parseFloat(process.env.TEMPERATURE || '0.4');
export const characterLimit = parseInt(process.env.CHARACTER_LIMIT || '1500', 10);
export const apiResponseUpdateFrequency = parseInt(process.env.API_RESPONSE_UPDATE_FREQUENCY || '10', 10);
export const defaultKeepAlive = process.env.KEEP_ALIVE || '45m';
export const adminUserId = process.env.ADMIN || null;
export const requireMention = process.env.REQUIRE_MENTION === 'true';

// Re-export imported functions and types
export { getState, updateState, setActiveChannel, BotState };
export { chatBot };
