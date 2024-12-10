import { EmbedBuilder, TextChannel, ThreadChannel, DMChannel, NewsChannel, Channel, BaseGuildTextChannel } from 'discord.js';
import { getActiveChannel } from '../utilities';

type TextBasedChannel = TextChannel | ThreadChannel | DMChannel | NewsChannel | BaseGuildTextChannel;

function isTextBasedChannel(channel: any): channel is TextBasedChannel {
    return channel !== null && 
           typeof channel?.send === 'function';
}

export const handleGlobalError = async (error: any) => {
    const activeChannel = getActiveChannel();
    if (!activeChannel || !isTextBasedChannel(activeChannel)) return;

    let statusCode = 'Unknown';
    let errorMessage = 'An unknown error occurred';

    // Extract error information
    if (error.response) {
        statusCode = error.response.status;
        errorMessage = error.response.data?.error?.message || 
                      error.response.data?.message || 
                      error.message;
    } else if (error.code) {
        statusCode = error.code;
        errorMessage = error.message;
    } else if (error instanceof Error) {
        errorMessage = error.message;
    }

    // Create error embed
    const errorEmbed = new EmbedBuilder()
        .setDescription(`\`\`\`\n${errorMessage}\n\`\`\``)

    try {
        await activeChannel.send({ embeds: [errorEmbed] });
    } catch (err) {
        console.error('Failed to send error message:', err);
    }
};