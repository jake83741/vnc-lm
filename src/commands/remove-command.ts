import { CommandInteraction, CacheType } from 'discord.js';
import axios from 'axios';
import { chatBot, ollamaUrl, adminUserId, defaultModelManager } from '../utilities';
import { updateState } from '../utilities';
import { refreshModelLibrary } from '../bot';
import { ClientFactory } from '../api-connections/factory';

export async function handleRemoveModel(interaction: CommandInteraction<CacheType>, modelName: string) {
    const channel = interaction.channel;
    const isThread = channel?.isThread();

    const sendResponse = async (content: string, ephemeral: boolean = true) => {
        if (isThread) {
            await channel?.send(content);
        } else {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content, ephemeral });
            } else {
                await interaction.followUp({ content, ephemeral });
            }
        }
    };

    if (!adminUserId) {
        await sendResponse('Admin user ID is not set. Model removal is disabled.');
        return;
    }

    if (interaction.user.id !== adminUserId) {
        await sendResponse('You do not have permission to remove models.');
        return;
    }

    try {
        // Get model directories to check source
        const modelDirectories = await defaultModelManager.loadModelDirectories();

        // Check if model exists in directories
        if (!modelDirectories[modelName]) {
            await sendResponse(`Model ${modelName} not found.`, true);
            return;
        }

        // Use the modelSources map to determine if it's a hosted model
        const modelSource = defaultModelManager.modelSources.get(modelName);
        if (modelSource === 'litellm') {
            await sendResponse('Only local models may be removed.', true);
            return;
        }

        if (isThread) {
            await sendResponse(`Attempting to remove model ${modelName}...`);
        }

        const response = await axios.delete(`${ollamaUrl}/api/delete`, {
            data: { name: modelName }
        });
        
        if (response.status === 200) {
            await refreshModelLibrary();
            
            if (chatBot.modelName === modelName) {
                chatBot.modelName = null;
                if (interaction.client.user) {
                    interaction.client.user.setActivity('no active model, use /model');
                }
                updateState({
                    lastUsedModel: null,
                    lastSystemPrompt: null,
                    lastTemperature: null,
                    lastNumCtx: null
                });
            }
            
            await sendResponse(
                `The model ${modelName} has been removed.`,
                !isThread
            );
        } else {
            await sendResponse(
                `Failed to delete the model ${modelName}.`,
                !isThread
            );
        }
    } catch (error) {
        console.error(`Error deleting model:`, error);
        // If we get a 404, assume it's a hosted model that wasn't caught by our check
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            await sendResponse('Hosted models cannot be removed.', true);
        } else {
            await sendResponse(
                `An error occurred while deleting model ${modelName}.`,
                !isThread
            );
        }
    }
}
