import { Message, MessageType, TextChannel, DMChannel, NewsChannel, ThreadChannel } from 'discord.js';
import axios from 'axios';
import { BotSettings, chatBot, adminUserId, defaultNumCtx, defaultTemperature, requireMention } from '../utils';
import { getActiveChannel, MessageData, messageDataMap, updateMessageCache, getState, updateState, createNewConversation } from '../managers/cache-manager';
import { handleResponseStream } from './chunk-generation';
import { preprocessMessage } from './message-preprocessing';
import { handleModelPull } from '../api-connections/model-pull';

// Define a type for text-based channels
type TextBasedChannel = TextChannel | DMChannel | NewsChannel | ThreadChannel;

// Type guard to check if a channel is text-based
const isTextBasedChannel = (channel: any): channel is TextBasedChannel =>
  channel.isTextBased() && 'send' in channel && 'sendTyping' in channel;

// Extract model tag from a URL
const extractModelTag = (url: string): string | null => {
  // Check for Ollama URL
  const ollamaMatch = url.match(/https:\/\/ollama\.com\/(.+)/);
  if (ollamaMatch) return ollamaMatch[1];

  // Check for HuggingFace URL
  const hfMatch = url.match(/https:\/\/huggingface\.co\/([^\/]+\/[^\/]+)\/blob\/main\/([^\/]+\.gguf)/);
  if (hfMatch) {
    const [, repoPath, fileName] = hfMatch;
    return `hf.co/${repoPath}:${fileName.replace('.gguf', '')}`;
  }

  return null;
};

export async function handleMessageCreate(message: Message) {
  // Ignore bot messages and thread creation messages
  if (message.author.bot || message.type === MessageType.ThreadCreated) return;
  
  // Check if the bot was mentioned if required
  if (requireMention && !message.mentions.has(message.client.user!.id)) return;

  // Check if the message is in the active channel
  const activeChannel = getActiveChannel();
  if (!activeChannel || message.channel.id !== activeChannel.id) return;
  
  // Handle 'stop' command
  if (message.content.toLowerCase() === 'stop') {
    if (BotSettings.currentRequest) {
      chatBot.cancelRequest('Generation stopped by user');
      BotSettings.currentRequest = null;
    }
    message.delete().catch(error => console.error('Failed to delete "stop" message:', error));
    return;
  }
  
  // Handle 'reset' command
  if (message.content.toLowerCase() === 'reset') {
    chatBot.resetContext();
    chatBot.clearSystem();
    chatBot.setNumCtx(defaultNumCtx);
    chatBot.setTemperature(defaultTemperature);

    const newConversationId = createNewConversation();

    updateState({
      lastSystemPrompt: null,
      lastTemperature: defaultTemperature,
      lastNumCtx: defaultNumCtx,
      currentConversationId: newConversationId
    });

    message.delete().catch(error => console.error('Failed to delete "reset" message:', error));

    return;
  }

  // Handle model pull requests
  const modelTag = extractModelTag(message.content);
  if (modelTag) {
    if (!adminUserId || message.author.id !== adminUserId) {
      await message.reply('You do not have permission to pull models.');
      return;
    }
    await handleModelPull(message, modelTag);
    return;
  }
  
  // Check if a model is active
  if (!chatBot.modelName) {
    await message.reply('No active model. Please set a model using the /model command.');
    return;
  }

  try {
    // Preprocess the message
    const { userInput } = await preprocessMessage(message);
    const state = getState();
    
    // Prepare the full prompt
    let fullPrompt = state.restoredConversation
      ? `${state.restoredInstructions}\n\nConversation history:\n${state.restoredConversation}\n\nNew user message: ${userInput}`
      : userInput;
    
    // Clear restored conversation if it exists
    if (state.restoredConversation) {
      updateState({ restoredConversation: null, restoredInstructions: null });
    }

    // Send typing indicator
    if (isTextBasedChannel(message.channel)) {
      await message.channel.sendTyping();
    }
    
    // Generate response
    chatBot.cancelRequest('New request started');
    const responseStream = await chatBot.generateResponse(fullPrompt, chatBot.getContext());
    
    if (responseStream) {
      BotSettings.currentRequest = responseStream;
      // Initialize message data
      const initialMessageData: MessageData = { 
        content: '',
        isUserMessage: false,
        pages: [''], 
        modelName: chatBot.modelName || '', 
        currentPageIndex: 0 
      };
      // Handle the response stream
      const sentMessage = await handleResponseStream(responseStream, message, initialMessageData);
      
      // Update message cache if a message was sent
      if (sentMessage) {
        messageDataMap.set(sentMessage.id, initialMessageData);
        updateMessageCache(sentMessage.id, sentMessage.channelId, initialMessageData.content, false, initialMessageData);
      }
    } else if (isTextBasedChannel(message.channel)) {
      await message.channel.send('No response from the model.');
    }
  } catch (error) {
    // Handle errors
    console.error(axios.isCancel(error) ? `Request canceled: ${error.message}` : 'Error generating response:', error);
    if (!axios.isCancel(error)) {
      await message.reply('An error occurred while generating the response. Please try again or contact an administrator.');
    }
  }
}
