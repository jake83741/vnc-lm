import { Client, GatewayIntentBits, Message } from 'discord.js';
import dotenv from 'dotenv';
import { BotSettings, defaultNumCtx, chatBot, CachedMessageData, ClientFactory, Conversation, defaultModelManager, ModelDirectories, initializeCache, getState, restoreMessageDataFromCache, messageDataMap, deleteMessageFromCache, getActiveChannel, cacheStore, setActiveChannel, updateState } from './utilities';
import { setupGlobalMessageCollector } from './managers/generation/messages';
import { handleCommands, registerCommands } from './commands/command-registry';
import { handleMessageCreate, handleMessageUpdate } from './managers/generation/controller';

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
  await ClientFactory.initializeOllamaModels(); // Initialize Ollama models first
  modelDirectories = await defaultModelManager.loadModelDirectories();
  console.log('Loaded model directories:\n[' + 
    Object.keys(modelDirectories)
      .map(dir => '\n  \x1b[90m' + `'${dir}'` + '\x1b[0m')
      .join(',') + 
    '\n]'
  );
  const modelOptions = Object.keys(modelDirectories).map(modelName => ({ name: modelName, value: modelName }));
  await registerCommands(client, modelOptions);
  return modelDirectories;
}

async function initializeBotSettings() {
  await BotSettings.initialize(client);
  const { lastUsedModel, lastSystemPrompt, lastTemperature, lastNumCtx } = getState();

  // First try to get model from state
  if (lastUsedModel && modelDirectories[lastUsedModel]) {
      chatBot.resetContext();
      chatBot.modelName = lastUsedModel;
      chatBot.clearSystem();
      chatBot.setTemperature(lastTemperature || 0.4);
      chatBot.setNumCtx(lastNumCtx || defaultNumCtx);
      if (lastSystemPrompt) chatBot.setSystem(lastSystemPrompt);
  } else {
      // If no model in state, try to get it from active channel's conversation
      const activeChannel = getActiveChannel();
      if (activeChannel) {
          const state = getState();
          const conversation = state.currentConversationId ? 
              cacheStore.cache.conversations[state.currentConversationId] : null;
          
          if (conversation) {
            const lastBotMessage = [...conversation.messages]
            .reverse()
            .find((msg: CachedMessageData) => !msg.data.isUserMessage && msg.data.modelName);

              if (lastBotMessage?.data.modelName) {
                  const modelName = lastBotMessage.data.modelName;
                  if (modelDirectories[modelName]) {
                      chatBot.resetContext();
                      chatBot.modelName = modelName;
                      const client = ClientFactory.getClient(modelName);
                      client.modelName = modelName;
                      
                      // Set up conversation history
                      const history = conversation.messages.map(msg => ({
                          role: msg.data.isUserMessage ? 'user' : 'assistant',
                          content: msg.data.content
                      }));
                      client.setConversationHistory(history);
                      chatBot.setConversationHistory(history);
                                            
                      // Update state with the restored model
                      updateState({ lastUsedModel: modelName });
                  }
              }
          }
      }
  }

  client.user?.setActivity(chatBot.modelName ? `${chatBot.modelName}` : 'no active model, use /model');
}

async function ensureConversationActive(channelId: string): Promise<boolean> {
  const activeChannel = getActiveChannel();
  if (!activeChannel || channelId !== activeChannel.id) {
    const conversation = Object.values(cacheStore.cache.conversations).find((conv): conv is Conversation => 
      'messages' in conv && Array.isArray(conv.messages) &&
      conv.messages.some((msg: CachedMessageData) => msg.channelId === channelId)
  );

    if (conversation) {
      const channel = await client.channels.fetch(channelId);
      if (channel) {
        setActiveChannel(channel);
        
        if (chatBot.modelName) {
          const modelClient = ClientFactory.getClient(chatBot.modelName);
          modelClient.resetContext();
          modelClient.setConversationHistory(
            conversation.messages.map(msg => ({
              role: msg.data.isUserMessage ? 'user' : 'assistant',
              content: msg.data.content
            }))
          );
        }

        updateState({
          currentConversationId: conversation.id,
          activeChannel: channelId
        });
        return true;
      }
    }
  }
  return activeChannel?.id === channelId;
}

function startBot() {
  const token = process.env.TOKEN;
  if (!token) {
    console.log("DISCORD_TOKEN environment variable not found.");
    process.exit(1);
  }

  client.login(token).catch((error: Error) => {
    console.error('Failed to log in:', error);
    setTimeout(startBot, 5000);
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
 
    // Add the random braille cube effect
    const brailleChars = ['⠀', '⠁', '⠂', '⠃', '⠄', '⠅', '⠆', '⠇', '⠈'];
    let brailleGrid = new Array(20).fill(0).map(() => 
      `\x1b[92m${brailleChars[Math.floor(Math.random() * brailleChars.length)]}\x1b[0m\x1b[90m${brailleChars[Math.floor(Math.random() * brailleChars.length)]}\x1b[0m`
    );
 
    // Print initial state
    console.log(brailleGrid.join(''));
 
    const brailleInterval = setInterval(() => {
      // Update the braille grid with new random characters
      brailleGrid = brailleGrid.map(() => 
        `\x1b[92m${brailleChars[Math.floor(Math.random() * brailleChars.length)]}\x1b[0m\x1b[90m${brailleChars[Math.floor(Math.random() * brailleChars.length)]}\x1b[0m`
      );
 
      // Move cursor up 1 line
      process.stdout.write('\x1b[1A');
      // Print the line
      console.log(brailleGrid.join(''));
    }, 500);
 
    // Clean up the interval when the bot is stopped
    client.on('disconnect', () => {
      clearInterval(brailleInterval);
    });
  });

  client.on('messageCreate', handleMessageCreate);

  client.on('messageUpdate', async (oldMessage, newMessage) => {
    try {
      const fetchedOldMessage = oldMessage.partial ? await oldMessage.fetch() : oldMessage;
      const fetchedNewMessage = newMessage.partial ? await newMessage.fetch() : newMessage;
      await handleMessageUpdate(fetchedOldMessage as Message, fetchedNewMessage as Message);
    } catch (error) {
      console.error('Error handling message update:', error);
    }
  });

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

  client.on('messageDelete', async (message) => {
    try {
      if (message.channel.isThread()) {
        if (await ensureConversationActive(message.channel.id)) {
          const state = getState();
          if (state.currentConversationId) {
            const conversation = cacheStore.cache.conversations[state.currentConversationId];
            if (conversation) {
              const messageIndex = conversation.messages.findIndex((msg: CachedMessageData) => msg.messageId === message.id);
              if (messageIndex !== -1) {
                const deletedContent = conversation.messages[messageIndex].data.content;
                conversation.messages.splice(messageIndex, 1);
                cacheStore.saveCache();

                if (chatBot.modelName) {
                  const modelClient = ClientFactory.getClient(chatBot.modelName);
                  modelClient.removeFromHistory(deletedContent);
                }
              }
            }
          }
          messageDataMap.delete(message.id);
          deleteMessageFromCache(message.id, message.channel.id);
        }
      }
    } catch (error) {
      console.error('Error handling message deletion:', error);
    }
  });

  client.on('error', (error: Error) => {
    console.error('Client error:', error);
    client.destroy();
    setTimeout(startBot, 2500);
  });

  startBot();
  clientInstance = client;
}

export async function refreshModelLibrary(): Promise<ModelDirectories> {
  await loadModelDirectoriesAndRegisterCommands();
  console.log("Model library has been updated.");
  return modelDirectories;
}

initialize();
