import { Message } from 'discord.js';
import { BotSettings, chatBot } from '../utilities';
import axios from 'axios';
import { ClientFactory } from '../api-connections/factory';

export async function handleStopCommand(message: Message): Promise<boolean> {
    // Check if it's a stop command
    if (message.content.toLowerCase() !== 'stop') {
        return false;
    }

    if (BotSettings.currentRequest) {
        try {
            // Cancel the current request through the active client
            if (chatBot.modelName) {
                const client = ClientFactory.getClient(chatBot.modelName);
                await client.cancelRequest('Generation stopped by user');
            }
            
            // Delete the stop message silently
            message.delete().catch(error => {
                console.log('Could not delete stop message:', error);
            });
        } catch (error) {
            if (!axios.isCancel(error)) {
                console.error('Error handling stop command:', error);
            }
        } finally {
            BotSettings.currentRequest = null;
        }
    }

    return true;
}