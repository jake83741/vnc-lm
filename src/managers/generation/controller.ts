import { Message, MessageType, TextChannel, DMChannel, NewsChannel, ThreadChannel, Client } from 'discord.js';
import axios from 'axios';
import { chatBot, adminUserId, requireMention } from '../../utilities';
import { getActiveChannel, messageDataMap, updateMessageCache, getState, updateState, cacheStore, setActiveChannel } from '../../utilities';
import { preprocessMessage } from './processor';
import { CachedMessageData, Conversation, defaultModelManager } from '../../utilities';;
import { ClientFactory } from '../../api-connections/factory';
import { handleStopCommand } from '../../commands/stop-command';
import { handleThreadConversation } from '../../commands/thread-command';
import { handleMessageResponse } from './stream';
import { setupGlobalMessageCollector } from './messages';

type TextBasedChannel = TextChannel | DMChannel | NewsChannel | ThreadChannel;
const isTextBasedChannel = (channel: any): channel is TextBasedChannel => 
    channel?.isTextBased() && 'send' in channel && 'sendTyping' in channel;

export const extractModelTag = (url: string): string | null => {
    const ollamaMatch = url.match(/https:\/\/ollama\.com\/(.+)/);
    if (ollamaMatch) return ollamaMatch[1];

    const hfMatch = url.match(/https:\/\/huggingface\.co\/([^\/]+\/[^\/]+)\/blob\/main\/([^\/]+\.gguf)/);
    return hfMatch ? `hf.co/${hfMatch[1]}:${hfMatch[2].replace('.gguf', '')}` : null;
};

export async function handleMessageUpdate(oldMessage: Message, newMessage: Message) {
    if (oldMessage.author.bot || oldMessage.content === newMessage.content) return;

    const activeChannel = getActiveChannel();
    if (!activeChannel || newMessage.channel.id !== activeChannel.id) return;

    const state = getState();
    const conversation = state.currentConversationId ? 
        cacheStore.cache.conversations[state.currentConversationId] : null;
    if (!conversation?.messages) return;  // Add null check for messages

    // Find message in conversation
    const messageIndex = conversation.messages.findIndex(msg => 
        msg && msg.messageId === oldMessage.id && msg.channelId === oldMessage.channelId
    );
    
    if (messageIndex === -1) return;

    try {
        // Safely update cache
        const messageData = conversation.messages[messageIndex].data;
        if (!messageData) return;  // Add safety check
        
        messageData.content = newMessage.content;
        updateMessageCache(oldMessage.id, oldMessage.channelId, newMessage.content, true);

        // Update model's conversation history if we have an active model
        if (chatBot.modelName) {
            const client = ClientFactory.getClient(chatBot.modelName);
            client.updateInHistory(oldMessage.content, newMessage.content);
        }

        const botResponse = conversation.messages[messageIndex + 1];
        if (botResponse && !botResponse.data.isUserMessage) {
            const { userInput } = await preprocessMessage(newMessage);
            const cachedMessages = conversation.messages
                .slice(0, messageIndex + 1)
                .map(msg => ({
                    role: msg.data.isUserMessage ? 'user' : 'assistant',
                    content: msg.data.content
                }));

            if (isTextBasedChannel(newMessage.channel)) {
                try {
                    const botMessage = await newMessage.channel.messages.fetch(botResponse.messageId);
                    if (botMessage) {
                        messageDataMap.delete(botMessage.id);
                        await handleMessageResponse(newMessage, userInput, undefined, cachedMessages, botMessage);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching bot message:', error);
                }
            }
            await handleMessageResponse(newMessage, userInput, undefined, cachedMessages);
        }
    } catch (error) {
        console.error('Error handling edited message:', error);
        await newMessage.reply('An error occurred while processing your edit.').catch(console.error);
    }
}

export async function handleMessageCreate(message: Message) {
    if (message.author.bot || message.type === MessageType.ThreadCreated) return;
    if (requireMention && !message.mentions.has(message.client.user!.id)) return;

    if (message.reference && message.content.toLowerCase() === '>') {
        await handleThreadConversation(message);
        return;
    }

    const modelTag = extractModelTag(message.content);
    if (modelTag) {
        if (message.channel.isThread()) {
            await message.reply('Model pulling can only be done in the main channel, not in threads.');
            return;
        }
        if (!adminUserId || message.author.id !== adminUserId) {
            await message.reply('You do not have permission to pull models.');
            return;
        }
        await defaultModelManager.handleModelPull(message, modelTag).catch((error: any) => {
            console.error('Error handling model pull:', error);
            message.reply('An error occurred while pulling the model.');
        });
        return;
    }

    if (message.channel.isThread()) {
        const activeChannel = getActiveChannel();
        if (!activeChannel || message.channelId !== activeChannel.id) {
            const conversation = Object.values(cacheStore.cache.conversations)
            .find((conv): conv is Conversation => 
                'messages' in conv && conv.messages.some((msg: CachedMessageData) => 
                    msg.channelId === message.channelId)
            );
    
            if (conversation) {
                await setActiveChannel(message.channel);
                if (chatBot.modelName) {
                    const client = ClientFactory.getClient(chatBot.modelName);
                    client.resetContext();
                    
                    // Restore conversation-specific system prompt
                    if (conversation.systemPrompt !== undefined) {
                        client.setSystem(conversation.systemPrompt);
                        chatBot.system = conversation.systemPrompt;
                    } else {
                        client.clearSystem();
                        chatBot.system = null;
                    }
    
                    client.setConversationHistory(
                        conversation.messages.map(msg => ({
                            role: msg.data.isUserMessage ? 'user' : 'assistant',
                            content: msg.data.content
                        }))
                    );
                    message.client.user?.setActivity(chatBot.modelName);
                }
                updateState({
                    currentConversationId: conversation.id,
                    activeChannel: message.channelId
                });
            }
        }
    }

    const activeChannel = getActiveChannel();
    if (!activeChannel || message.channel.id !== activeChannel.id) return;

    try {
        const processed = await preprocessMessage(message);
        if (processed.isModelSwitch || await handleStopCommand(message)) return;
    
        // Only proceed with message handling if there's actual content
        if (processed.userInput) {
            const { userInput, imageUrls, additionalData } = processed;
            const state = getState();
            const conversation = state.currentConversationId ? 
                cacheStore.cache.conversations[state.currentConversationId] : null;
    
            // Cache the user's message first with attachments
            updateMessageCache(
                message.id,
                message.channelId,
                userInput,
                true,
                {
                    attachments: additionalData?.attachments || []
                }
            );
    
            const cachedMessages = conversation?.messages
                .filter((msg: CachedMessageData, i: number, arr: CachedMessageData[]) => 
                    !(i === arr.length - 1 && msg.data.content === userInput))
                .map((msg: CachedMessageData) => ({
                    role: msg.data.isUserMessage ? 'user' : 'assistant',
                    content: msg.data.content,
                    // Include attachments in conversation history if they exist
                    attachments: msg.data.attachments
                })) ?? [];
    
            await handleMessageResponse(
                message, 
                userInput, 
                imageUrls, 
                cachedMessages
            );
        }
    } catch (error) {
        if (!axios.isCancel(error)) {
            console.error('Error generating response:', error);
            await message.reply(error instanceof Error && error.message.includes('429') ?
                '```\nError 429: Rate Limit Exceeded\n```' :
                'An error occurred while generating the response. Please try again or contact an administrator.'
            );
        }
    }
}

export function initializeMessageHandling(client: Client) {
    setupGlobalMessageCollector(client, messageDataMap);
    
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
}
