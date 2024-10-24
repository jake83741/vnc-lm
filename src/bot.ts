import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { BotSettings, defaultNumCtx, chatBot } from './utilities';
import { defaultModelManager, ModelDirectories } from './api-connections';
import { initializeCache, getState, restoreMessageDataFromCache, messageDataMap } from './managers/cache';
import { setupGlobalMessageCollector } from './managers/message/manager';
import { handleCommands, registerCommands } from './commands/command-registry';
import { handleMessageCreate } from './managers/generation/create';

// Load environment variables
dotenv.config();
// Remove all warning listeners
process.removeAllListeners('warning');

// Create a new Discord client with specified intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

export let clientInstance: Client;
let modelDirectories: ModelDirectories;

async function loadModelDirectoriesAndRegisterCommands() {
  // Use defaultModelManager instead of loadModelDirectories
  modelDirectories = await defaultModelManager.loadModelDirectories();
  console.log('Loaded model directories:', Object.keys(modelDirectories));
  const modelOptions = Object.keys(modelDirectories).map(modelName => ({ name: modelName, value: modelName }));
  await registerCommands(client, modelOptions);
  return modelDirectories;
}

async function initializeBotSettings() {
  // Initialize bot settings and restore previous state
  await BotSettings.initialize(client);
  const { lastUsedModel, lastSystemPrompt, lastTemperature, lastNumCtx } = getState();

  if (lastUsedModel && modelDirectories[lastUsedModel]) {
    // Restore previous chatbot state
    chatBot.resetContext();
    chatBot.modelName = lastUsedModel;
    chatBot.clearSystem();
    chatBot.setTemperature(lastTemperature || 0.4);
    chatBot.setNumCtx(lastNumCtx || defaultNumCtx);
    if (lastSystemPrompt) chatBot.setSystem(lastSystemPrompt);
    console.log(`Resumed last used model: ${lastUsedModel}`);
  }

  // Set bot's activity status
  client.user?.setActivity(lastUsedModel ? `${lastUsedModel}` : 'no active model, use /model');
}

function startBot() {
  // Get bot token from environment variables
  const token = process.env.TOKEN;
  if (!token) {
    console.log("DISCORD_TOKEN environment variable not found.");
    process.exit(1);
  }

  // Login to Discord
  client.login(token).catch((error: Error) => {
    console.error('Failed to log in:', error);
    setTimeout(startBot, 5000); // Retry login after 5 seconds
  });
}

async function initialize() {

  client.on('ready', async () => {
    console.log(`We have logged in as ${client.user?.tag}`);
    await refreshModelLibrary();
    initializeCache();
    await initializeBotSettings();
    await restoreMessageDataFromCache(client);
    setupGlobalMessageCollector(client, messageDataMap);
  });

  client.on('messageCreate', handleMessageCreate);

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;
    try {
      await handleCommands(interaction, modelDirectories);
    } catch (error) {
      console.error('Error handling command:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'An error occurred while processing the command.', ephemeral: true }).catch(console.error);
      }
    }
  });

  client.on('error', (error: Error) => {
    console.error('Client error:', error);
    client.destroy();
    setTimeout(startBot, 2500); // Restart bot after 2.5 seconds
  });

  startBot();
  clientInstance = client;
}

export async function refreshModelLibrary(): Promise<ModelDirectories> {
  // Refresh model library and re-register commands
  await loadModelDirectoriesAndRegisterCommands();
  console.log("Model library has been updated.");
  return modelDirectories;
}

// Start the bot
initialize();
