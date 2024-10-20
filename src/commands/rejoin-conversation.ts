import { ContextMenuCommandInteraction, Message } from 'discord.js';
import { cache, updateState } from '../managers/cache-manager';
import { chatBot } from '../utils';

// Function to format conversation messages into a string
function formatConversation(messages: any[]): string {
    return messages.map((msg: any) => 
        `${msg.data.isUserMessage ? 'user message:' : 'bot message:'}\n${msg.data.content}\n`
    ).join('\n');
}

export async function handleRejoinConversation(interaction: ContextMenuCommandInteraction) {
    // Check if the interaction is a message context menu command
    if (!interaction.isMessageContextMenuCommand()) {
        await interaction.reply({ content: 'This command can only be used on messages.', ephemeral: true });
        return;
    }

    const message = interaction.targetMessage;
    const channelId = message.channelId;

    // Find the conversation that contains the target message
    const conversation = Object.values(cache.conversations).find(conv => 
        conv.messages.some(msg => msg.messageId === message.id && msg.channelId === channelId)
    );

    // If no conversation is found, inform the user and return
    if (!conversation) {
        await interaction.reply({ content: 'Unable to find the conversation for this message.', ephemeral: true });
        return;
    }

    // Find the index of the target message in the conversation
    const messageIndex = conversation.messages.findIndex(msg => msg.messageId === message.id);

    // Get the conversation history up to and including the target message
    const conversationHistory = conversation.messages.slice(0, messageIndex + 1);
    // Format the conversation history
    const formattedConversation = formatConversation(conversationHistory);
    // Define instructions for continuing the conversation
    const instructions = "Continue where the conversation left off. Answer everything in the same style as the bot in the following conversation.";

    // Update the global state with the current conversation details
    updateState({
        currentConversationId: conversation.id,
        activeChannel: channelId,
        lastUsedModel: conversationHistory[0]?.data.modelName || null,
        restoredConversation: formattedConversation,
        restoredInstructions: instructions
    });

    // Reset the chatBot context
    chatBot.resetContext();

    // Find the last bot message in the conversation history
    const lastBotMessage = conversationHistory.filter(msg => !msg.data.isUserMessage).pop();
    if (lastBotMessage) {
        // If a bot message is found, inform the user that they've rejoined the conversation
        await interaction.reply({
            content: `Rejoined the conversation.`,
            ephemeral: true
        });
    } else {
        // If no bot message is found, inform the user accordingly
        await interaction.reply({ content: 'Rejoined the conversation, but no previous bot messages found.', ephemeral: true });
    }
}