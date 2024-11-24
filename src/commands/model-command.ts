import { CommandInteraction, CacheType, ThreadChannel, TextChannel } from 'discord.js';
import { updateState, setActiveChannel, createNewConversation } from '../utilities';
import { defaultModelManager } from '../utilities';
import { chatBot } from '../utilities';
import { handleRemoveModel } from './remove-command';
import { ClientFactory } from '../api-connections/factory';
import { defaultTemperature, defaultNumCtx } from '../utilities/settings';
import { ModelDirectories } from '../utilities/types';
import keyword_extractor from 'keyword-extractor';

const generateThreadName = (prompt?: string | null): string => {
    if (!prompt) return Math.random().toString().slice(2, 14);

    try {
        // Extract keywords
        const keywords = keyword_extractor.extract(prompt, {
            language: "english",
            remove_digits: true,
            return_changed_case: true,
            remove_duplicates: true
        });

        // Take first 3-4 keywords and join them
        const title = keywords.slice(0, 4).join("-");
        
        // If we got keywords, use them, otherwise use random number
        return title || Math.random().toString().slice(2, 14);
    } catch (error) {
        console.error('Error generating thread name:', error);
        return Math.random().toString().slice(2, 14);
    }
};

export const handleModelCommand = async (interaction: CommandInteraction<CacheType>, modelDirectories: ModelDirectories) => {
    await interaction.deferReply({ ephemeral: true });

    updateState({
        restoredConversation: null,
        restoredInstructions: null
    });

    const modelName = interaction.options.get('model')?.value as string;
    const numCtx = interaction.options.get('num_ctx')?.value as number | null;
    const systemPrompt = interaction.options.get('system_prompt')?.value as string | null;
    const temperature = interaction.options.get('temperature')?.value as number | null;
    const remove = interaction.options.get('remove')?.value as boolean;

    if (remove) {
        await handleRemoveModel(interaction, modelName);
        return;
    }

    if (modelName in modelDirectories) {
        // Check if the channel is a text channel
        if (!interaction.channel || !(interaction.channel instanceof TextChannel)) {
            await interaction.followUp({
                content: 'Change models during conversation with `+`.',
                ephemeral: true
            });
            return;
        }

        const newConversationId = createNewConversation();
        const client = ClientFactory.getClient(modelName);

        // Set model-specific settings
        client.modelName = modelName;
        client.resetContext();
        client.clearSystem();
        client.setTemperature(temperature !== null ? temperature : defaultTemperature);
        if (systemPrompt) {
            client.setSystem(systemPrompt);
        }
        if (numCtx !== null && 'setNumCtx' in client) {
            (client as any).setNumCtx(numCtx);
        }

        // Update chatBot with model settings (but not system prompt)
        chatBot.modelName = modelName;
        chatBot.temperature = temperature !== null ? temperature : defaultTemperature;
        if ('numCtx' in client) {
            (chatBot as any).numCtx = (client as any).numCtx;
        }
        if ('keepAlive' in client) {
            (chatBot as any).keepAlive = (client as any).keepAlive;
        }
        
        // Update bot activity
        if (interaction.client.user) {
            interaction.client.user.setActivity(`${modelName}`);
        }

        // Update state without system prompt
        updateState({
            lastUsedModel: modelName,
            lastTemperature: temperature !== null ? temperature : defaultTemperature,
            lastNumCtx: numCtx !== null ? numCtx : defaultNumCtx,
            currentConversationId: newConversationId
        });

        try {
            await interaction.followUp({
                content: `The model is loading.`,
                ephemeral: true
            });

            await defaultModelManager.loadModel(modelName);

            await interaction.followUp({
                content: `The model has loaded.`,
                ephemeral: true
            });

            // Create thread after successful model load
            let thread: ThreadChannel;
            try {
                // Generate initial thread name from system prompt if it exists
                const threadName = generateThreadName(systemPrompt);
                
                thread = await interaction.channel.threads.create({
                    name: threadName,
                    reason: `Model conversation: ${modelName}`
                });
            
                // Only set up listener for first message if there's no system prompt
                if (!systemPrompt) {
                    thread.client.once('messageCreate', async (message) => {
                        if (message.channelId === thread.id && !message.author.bot) {
                            const newThreadName = generateThreadName(message.content);
                            if (newThreadName !== threadName) {
                                await thread.setName(newThreadName).catch(error => {
                                    console.error('Error renaming thread:', error);
                                });
                            }
                        }
                    });
                }
            
                // Set the active channel to the thread
                setActiveChannel(thread as any);
                                
            } catch (error) {
                console.error('Error creating thread:', error);
                await interaction.followUp({
                    content: 'Model loaded but failed to create a thread for the conversation.',
                    ephemeral: true
                });
                return;
            }
        } catch (error) {
            console.error(`Error loading model:`, error);
            await interaction.followUp({
                content: `There was an issue loading the model ${modelName}.`,
                ephemeral: true,
            });
        }
    } else {
        await interaction.followUp({
            content: `The model ${modelName} was not found in the model directory.`,
            ephemeral: true
        });
    }
};