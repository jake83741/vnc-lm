import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const token = process.env.TOKEN;
export const ollamaUrl = process.env.OLLAMAURL;
export const defaultNumCtx = parseInt(process.env.NUM_CTX || '2048', 10);
export const defaultTemperature = parseFloat(process.env.TEMPERATURE || '0.4');
export const characterLimit = parseInt(process.env.CHARACTER_LIMIT || '1500', 10);
export const apiResponseUpdateFrequency = parseInt(process.env.API_RESPONSE_UPDATE_FREQUENCY || '10', 10);
export const defaultKeepAlive = process.env.KEEP_ALIVE || '45m';
export const adminUserId = process.env.ADMIN || null;
export const requireMention = process.env.REQUIRE_MENTION === 'true';