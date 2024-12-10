import { AxiosResponse } from 'axios';
import { chatBot, getState, setActiveChannel } from '../utilities';
import dotenv from 'dotenv';

dotenv.config();

export const token = process.env.TOKEN;
export const ollamaUrl = process.env.OLLAMAURL;
export const defaultNumCtx = 2048;
export const defaultTemperature = 0.4;
export const characterLimit = 1500;
export const messageUpdateInterval = 10;
export const defaultKeepAlive = '45m';
export const adminUserId = process.env.ADMIN || null;
export const requireMention = process.env.REQUIRE_MENTION === 'true';
export const useVision = process.env.USE_VISION === 'true';


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
        }
      } catch (error) {
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
