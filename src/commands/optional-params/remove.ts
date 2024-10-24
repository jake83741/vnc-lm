import { CommandInteraction, CacheType } from 'discord.js';
import axios from 'axios';
import { chatBot, ollamaUrl, adminUserId } from '../../utilities';
import { updateState } from '../../managers/cache';
import { refreshModelLibrary } from '../../bot';

export async function handleRemoveModel(interaction: CommandInteraction<CacheType>, modelName: string) {
    // Check if admin user ID is set
    if (!adminUserId) {
        await interaction.reply({ content: 'Admin user ID is not set. Model removal is disabled.', ephemeral: true });
        return;
    }
    // Verify if the user has admin permissions
    if (interaction.user.id !== adminUserId) {
        await interaction.reply({ content: 'You do not have permission to remove models.', ephemeral: true });
        return;
    }

    try {
        // Send a DELETE request to remove the model
        const response = await axios.delete(`${ollamaUrl}/api/delete`, {
            data: { name: modelName }
        });
        
        if (response.status === 200) {
            // Refresh the model library after successful deletion
            await refreshModelLibrary();
            
            // Check if the removed model was the active one
            if (chatBot.modelName === modelName) {
                // Reset the chatBot's model
                chatBot.modelName = null;
                // Update the bot's activity status
                if (interaction.client.user) {
                    interaction.client.user.setActivity('no active model, use /model');
                }
                // Update the cache state
                updateState({
                    lastUsedModel: null,
                    lastSystemPrompt: null,
                    lastTemperature: null,
                    lastNumCtx: null
                });
            }
            
            // Inform the user of successful deletion
            await interaction.reply({ content: `The model has been removed.`, ephemeral: true });
        } else {
            // Inform the user if deletion failed
            await interaction.reply({ content: `Failed to delete the model.`, ephemeral: true });
        }
    } catch (error) {
        // Log and inform the user of any errors
        console.error(`Error deleting model:`, error);
        await interaction.reply({ content: `An error occurred while deleting the model.`, ephemeral: true });
    }
}
