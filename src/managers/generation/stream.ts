import { Message, TextChannel, DMChannel, NewsChannel, ThreadChannel, MessageCreateOptions, MessagePayload, MessageEditOptions } from 'discord.js';
import { BotSettings, chatBot, messageUpdateInterval, MessageData, updateMessageCache, messageDataMap } from '../../utilities';
import { addToPages, createPageEmbed, createPageButtons } from './pages';
import { ClientFactory } from '../../api-connections/factory';
import axios from 'axios';

type TextBasedChannel = TextChannel | DMChannel | NewsChannel | ThreadChannel;

// Type guard for text-based channels
function isTextBasedChannel(channel: any): channel is TextBasedChannel {
    return channel?.isTextBased() && 'send' in channel;
}

async function handleStreamResponse(
    responseStream: any,
    message: Message,
    messageData: MessageData,
    existingMessage?: Message
) {
    let responseMessage = existingMessage;
    let isComplete = false;

    if (existingMessage) {
        Object.assign(messageData, { content: '', pages: [''], currentPageIndex: 0 });
        messageDataMap.set(existingMessage.id, messageData);
    }

    const updateMessage = async () => {
        const embed = createPageEmbed(messageData, isComplete);
        const row = createPageButtons(messageData);
        const messageOptions: MessageCreateOptions & MessageEditOptions = { 
            embeds: [embed], 
            components: [row] 
        };

        try {
            if (!responseMessage) {
                responseMessage = await message.reply(messageOptions);
                responseMessage && messageDataMap.set(responseMessage.id, messageData);
            } else {
                await responseMessage.edit(messageOptions as MessagePayload | MessageEditOptions);
            }
        } catch (error: any) {
            console.error('Error updating message:', error);
            if (error?.code === 50035 && isTextBasedChannel(message.channel)) {
                responseMessage = await message.channel.send(messageOptions);
            }
        }
    };

    let apiResponseCount = 0;
    responseStream.on('data', (chunk: Buffer) => {
        chunk.toString('utf8').split('\n')
            .filter(line => line.trim())
            .forEach(async line => {
                try {
                    const { response: content, context } = JSON.parse(line);
                    if (content) {
                        addToPages(messageData, content);
                        messageData.content += content;
                        if (++apiResponseCount === messageUpdateInterval) {
                            await updateMessage();
                            apiResponseCount = 0;
                        }
                    }
                    context && (chatBot.context = context);
                } catch (error) {
                    // Silently ignore JSON parsing errors
                }
            });
    });

    responseStream.on('end', async () => {
        try {
            isComplete = true;
            messageData.currentPageIndex = 0;
            await updateMessage();
            
            // If we have a response message, update the cache with full message data
            if (responseMessage) {
                const finalMessageData: MessageData = {
                    content: messageData.content,
                    isUserMessage: false,
                    pages: messageData.pages || [''],
                    modelName: messageData.modelName || '',
                    currentPageIndex: 0,
                    attachments: messageData.attachments || [] // Preserve attachments
                };
    
                updateMessageCache(
                    responseMessage.id,
                    responseMessage.channelId,
                    messageData.content,
                    false,
                    finalMessageData
                );
            }
        } catch (error) {
            console.error('Error finalizing message:', error);
        } finally {
            BotSettings.currentRequest = null;
        }
    });

    return responseMessage;
}

export async function handleMessageResponse(
    message: Message,
    userInput: string,
    imageUrls: string[] = [],
    cachedMessages: any[] = [],
    existingMessage?: Message
) {
    const currentClient = chatBot.modelName ? ClientFactory.getClient(chatBot.modelName) : null;
    if (!currentClient) {
        await message.reply('No active model. Please set a model using the /model command.');
        return;
    }

    if (isTextBasedChannel(message.channel)) {
        await message.channel.sendTyping();
    }

    currentClient.cancelRequest('New request started');
    const responseStream = await currentClient.generateResponse(
        userInput,
        currentClient.getContext(),
        imageUrls,
        cachedMessages
    );

    if (!responseStream) {
        if (isTextBasedChannel(message.channel)) {
            await message.channel.send('No response from the model.');
        }
        return;
    }

    // Set up the current request for potential cancellation
    BotSettings.currentRequest = Promise.resolve({ data: responseStream } as any);

    const initialMessageData: MessageData = {
        content: '',
        isUserMessage: false,
        pages: [''],
        modelName: currentClient.modelName || '',
        currentPageIndex: 0,
        attachments: [] // Add this line
    };

    try {
        return await handleStreamResponse(
            responseStream,
            message,
            initialMessageData,
            existingMessage
        );
    } catch (error) {
        if (!axios.isCancel(error)) {
            console.error('Error handling stream response:', error);
            if (isTextBasedChannel(message.channel)) {
                await message.channel.send('An error occurred while generating the response.');
            }
        }
        return null;
    }
}

export interface StreamManager {
    handleMessageResponse: typeof handleMessageResponse;
    handleStreamResponse: typeof handleStreamResponse;
}

export const streamManager: StreamManager = {
    handleMessageResponse,
    handleStreamResponse
};

// Error handling for uncaught stream errors
process.on('uncaughtException', (error) => {
    BotSettings.currentRequest = null;
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled stream rejection:', error);
    BotSettings.currentRequest = null;
});
