import { Message, Attachment } from 'discord.js';
import axios from 'axios';
import sharp from 'sharp';
import { ClientFactory } from '../../api-connections/factory';
import { chatBot, updateState, defaultModelManager, getState, cacheStore } from '../../utilities';
import { useVision } from '../../utilities/settings';
import { performOCR } from '../../commands/services/ocr';
import { scrapeWebsite } from '../../commands/services/scraper';

interface PreprocessedMessage {
    userInput: string;
    imageUrls: string[];
    isModelSwitch?: boolean;
    additionalData?: {
        attachments: Array<{
            type: 'text' | 'image';
            name: string;
            content: string;
        }>;
    };
}

// Cached model list and regex
const ALL_MODELS = new Set(); // Empty set since we're using LiteLLM proxy

const MODEL_SWITCH_REGEX = /^\+\s+(.+)$/;

async function findClosestModelMatch(input: string): Promise<string | null> {
    try {
        const modelDirectories = await defaultModelManager.loadModelDirectories();
        const models = Object.keys(modelDirectories);
        
        // Direct match check first
        const exactMatch = models.find(model => 
            model.toLowerCase().includes(input.toLowerCase())
        );
        if (exactMatch) return exactMatch;

        // Fuzzy match if no exact match found
        const bestMatch = models.reduce((best, model) => {
            // Split model name into parts for flexible matching
            const modelParts = model.toLowerCase().split(/[-\/\.]/);
            const inputParts = input.toLowerCase().split(/[-\/\.]/);
            
            // Score based on how many parts of the input match parts of the model name
            const score = inputParts.reduce((sum, part) => {
                return sum + (modelParts.some(m => m.includes(part)) ? part.length : 0);
            }, 0);

            return score > (best?.score || 2) ? { model, score } : best;
        }, null as null | { model: string, score: number });

        return bestMatch?.model || null; // Ensure we always return string | null
    } catch (error) {
        console.error('Error finding model match:', error);
        return null; // Return null on error
    }
}

async function processAttachment(attachment: Attachment): Promise<{text?: string, image?: string}> {
    try {
        if (attachment.contentType?.startsWith('image/')) {
            if (!useVision) {
                const text = await performOCR(attachment.url);
                return text ? { text } : {};
            }
            
            const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
            const processedImage = await sharp(response.data)
                .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80, progressive: true })
                .toBuffer();
                
            return { image: processedImage.toString('base64') };
        }
        
        if (attachment.contentType?.startsWith('text/')) {
            const { data } = await axios.get(attachment.url);
            return { text: `File: ${attachment.name}\n${data}` };
        }
    } catch (error) {
        console.error(`Error processing attachment ${attachment.name}:`, error);
    }
    return {};
}

export async function preprocessMessage(message: Message): Promise<PreprocessedMessage> {
    // Check for model switch
    const modelSwitch = message.content.match(MODEL_SWITCH_REGEX);
    if (modelSwitch) {
        try {
            const newModel = await findClosestModelMatch(modelSwitch[1]);
            if (!newModel) return { 
                userInput: message.content, 
                imageUrls: [],
                additionalData: { attachments: [] }
            };
    
            // Get the current conversation for this thread
            const state = getState();
            const conversation = state.currentConversationId ? 
                cacheStore.cache.conversations[state.currentConversationId] : null;
            
            // Get thread-specific system prompt
            const threadSystemPrompt = conversation?.systemPrompt || null;
            const currentTemperature = chatBot.temperature;
            const conversationHistory = chatBot.modelName ? 
                ClientFactory.getClient(chatBot.modelName).getConversationHistory() : [];
    
            await message.delete();
    
            // Get new client and configure it
            const newClient = ClientFactory.getClient(newModel);
            newClient.modelName = newModel;
            newClient.setSystem(threadSystemPrompt);  // Set thread-specific system prompt
            newClient.setTemperature(currentTemperature);
            newClient.setConversationHistory(conversationHistory);
    
            // Update chatBot settings
            chatBot.modelName = newModel;
            chatBot.setSystem(threadSystemPrompt);
            chatBot.setTemperature(currentTemperature);
            chatBot.setConversationHistory(conversationHistory);
    
            message.client.user?.setActivity(newModel);
    
            updateState({ 
                lastUsedModel: newModel,
                lastSystemPrompt: threadSystemPrompt,
                lastTemperature: currentTemperature
            });
    
            return { 
                userInput: '', 
                imageUrls: [], 
                isModelSwitch: true,
                additionalData: { attachments: [] }
            };
        } catch (error) {
            console.error('Error handling model switch:', error);
            return { 
                userInput: message.content, 
                imageUrls: [],
                additionalData: { attachments: [] }
            };
        }
    }

    // Process message content
    let userInput = message.content;
    const imageUrls: string[] = [];
    const textAttachments: string[] = [];
    
    const attachmentsData: Array<{
        type: 'text' | 'image';
        name: string;
        content: string;
    }> = [];

    // Process URLs
    const urls = userInput.match(/(https?:\/\/[^\s]+)/g);
    if (urls) {
        await Promise.all(urls.map(async url => {
            const content = await scrapeWebsite(url);
            userInput = userInput.replace(url, `\n\nScraped content from ${url}:\n${content}`);
        }));
    }

    // Process attachments
    if (message.attachments.size) {
        const results = await Promise.all(
            Array.from(message.attachments.values()).map(processAttachment)
        );
        
        results.forEach((result, index) => {
            const attachment = Array.from(message.attachments.values())[index];
            if (result.text) {
                textAttachments.push(result.text);
                attachmentsData.push({
                    type: 'text',
                    name: attachment?.name || 'unknown',
                    content: result.text
                });
            }
            if (result.image) {
                imageUrls.push(result.image);
                attachmentsData.push({
                    type: 'image',
                    name: attachment?.name || 'unknown',
                    content: result.image
                });
            }
        });
    }

    // Add text attachments to input
    if (textAttachments.length) {
        userInput += `\n\nText Attachments:\n${textAttachments.join('\n\n')}`;
    }

    // Process replied message
    if (message.reference?.messageId) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage) {
                const repliedContent = repliedMessage.embeds[0]?.description || repliedMessage.content;
                userInput += `\n\nReplied Message:\n${repliedContent}`;
            }
        } catch (error) {
            console.error('Error fetching replied message:', error);
        }
    }

    return { 
        userInput, 
        imageUrls,
        additionalData: { attachments: attachmentsData }
    };
}

export interface ContentProcessor {
    preprocessMessage: typeof preprocessMessage;
    processAttachment: typeof processAttachment;
}

export const contentProcessor: ContentProcessor = {
    preprocessMessage,
    processAttachment
};