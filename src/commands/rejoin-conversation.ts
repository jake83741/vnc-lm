import { ContextMenuCommandInteraction } from 'discord.js';
import { CacheManager, updateState, Conversation, CachedMessageData } from '../managers/cache';
import { chatBot } from '../api-connections';

function formatConversation(messages: CachedMessageData[]): string {
    return messages.map(msg => 
        `${msg.data.isUserMessage ? 'user message:' : 'bot message:'}\n${msg.data.content}\n`
    ).join('\n');
}

export async function handleRejoinConversation(interaction: ContextMenuCommandInteraction) {
    if (!interaction.isMessageContextMenuCommand()) {
        await interaction.reply({ content: 'This command can only be used on messages.', ephemeral: true });
        return;
    }

    const message = interaction.targetMessage;
    const channelId = message.channelId;

    const conversations = CacheManager.getCurrentConversations();
    
    const conversation = Object.values(conversations).find((conv): conv is Conversation => {
        return 'messages' in conv && Array.isArray(conv.messages) &&
            conv.messages.some(msg => msg.messageId === message.id && msg.channelId === channelId);
    });

    if (!conversation) {
        await interaction.reply({ content: 'Unable to find the conversation for this message.', ephemeral: true });
        return;
    }

    const messageIndex = conversation.messages.findIndex(msg => msg.messageId === message.id);
    const conversationHistory = conversation.messages.slice(0, messageIndex + 1);
    const formattedConversation = formatConversation(conversationHistory);
    
    // Define instructions for continuing the conversation
    const instructions = "Continue where the conversation left off. Answer everything in the same style as the bot in the following conversation.";

    // Update the global state
    updateState({
        currentConversationId: conversation.id,
        activeChannel: channelId,
        lastUsedModel: conversationHistory[0]?.data.modelName || null,
        restoredConversation: formattedConversation,
        restoredInstructions: instructions
    });

    // Reset the chatbot context
    chatBot.resetContext();

    // Find the last bot message
    const lastBotMessage = conversationHistory.filter((msg: CachedMessageData) => 
        !msg.data.isUserMessage
    ).pop();
    
    // Send appropriate response
    if (lastBotMessage) {
        await interaction.reply({
            content: `Rejoined the conversation.`,
            ephemeral: true
        });
    } else {
        await interaction.reply({ 
            content: 'Rejoined the conversation, but no previous bot messages found.', 
            ephemeral: true 
        });
    }
}