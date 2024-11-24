import { Message, ThreadChannel, EmbedBuilder, BaseGuildTextChannel, ThreadAutoArchiveDuration } from 'discord.js';
import { updateState, Conversation, cacheStore, setActiveChannel, createNewConversation, CachedMessageData } from '../utilities';
import { chatBot } from '../utilities';
import { ClientFactory } from '../api-connections/factory';
import keyword_extractor from 'keyword-extractor';

function generateThreadName(message: string, cachedContent: string): string {
    try {
        // Try to get the first two sentences from cached content first
        const sentences = cachedContent.match(/[^.!?]+[.!?]+/g)?.slice(0, 2) || [];
        const firstTwoSentences = sentences.join(' ');

        if (!firstTwoSentences) {
            // Fallback to message content if cache fails
            const messageSentences = message.match(/[^.!?]+[.!?]+/g)?.slice(0, 2) || [];
            const messageFirstTwo = messageSentences.join(' ');
            if (!messageFirstTwo) {
                return "new-thread";
            }
        }

        const keywords = keyword_extractor.extract(firstTwoSentences, {
            language: "english",
            remove_digits: true,
            return_changed_case: true,
            remove_duplicates: true
        });

        let title = keywords.slice(0, 3).join("-");
        
        if (!title || title.length === 0) {
            return "new-thread";
        }

        if (title.length > 100) {
            title = title.slice(0, 97) + "...";
        }

        return title.toLowerCase();
    } catch (error) {
        console.error('Error generating thread name:', error);
        return "new-thread";
    }
}

function generateTreeDiagram(parentName: string, currentName: string): string {
    let tree = '```\n';
    tree += `├── ${parentName}\n`;
    tree += `│   └── ${currentName}\n`;
    tree += '```';
    return tree;
}

export async function handleThreadConversation(message: Message) {
    if (!message.reference || message.content.toLowerCase() !== '>') {
        return;
    }

    try {
        await message.delete();
    } catch (error) {
        console.error('Failed to delete thread command:', error);
    }

    const repliedToMessage = await message.channel.messages.fetch(message.reference.messageId!);
    if (!repliedToMessage) return;

    const channelId = repliedToMessage.channelId;

    const conversation = Object.values(cacheStore.cache.conversations).find((conv): conv is Conversation => {
        return 'messages' in conv && Array.isArray(conv.messages) &&
            conv.messages.some(msg => msg.messageId === repliedToMessage.id && msg.channelId === channelId);
    });

    if (!conversation) return;

    const messageIndex = conversation.messages.findIndex(msg => msg.messageId === repliedToMessage.id);
    if (messageIndex === -1) return;

    // Get the cached content
    const cachedContent = conversation.messages[messageIndex].data.content;
    
    // Generate thread name using both message content and cached content
    const newThreadName = generateThreadName(repliedToMessage.content, cachedContent);

    const conversationHistory = conversation.messages.slice(0, messageIndex + 1);

    if (!chatBot.modelName) return;

    try {
        const newConversationId = createNewConversation();

        const parentChannel = message.channel;
        if (!parentChannel?.isTextBased() || !('guild' in parentChannel)) {
            return;
        }

        const channelToUseForThread = parentChannel.isThread() ? 
            (parentChannel as ThreadChannel).parent : 
            (parentChannel as BaseGuildTextChannel);

        if (!channelToUseForThread) return;

        const client = ClientFactory.getClient(chatBot.modelName);
        const summaryClient = ClientFactory.getClient(chatBot.modelName);
        summaryClient.modelName = chatBot.modelName;
        summaryClient.setSystem(client.system);
        summaryClient.setTemperature(client.temperature);

        const apiMessages = conversationHistory.map(msg => ({
            role: msg.data.isUserMessage ? 'user' : 'assistant',
            content: msg.data.content
        }));

        const summaryStream = await summaryClient.generateResponse(
            "Please provide a concise, monotone summary of the conversation so far. Do not use bullet points or markdown.",
            null,
            undefined,
            apiMessages
        );

        let summary = '';
        for await (const chunk of summaryStream) {
            try {
                const data = JSON.parse(chunk.toString());
                if (data.response) summary += data.response;
            } catch (error) {
                console.error('Error parsing summary chunk:', error);
            }
        }

        const parentThreadName = parentChannel.isThread() ? 
            (parentChannel as ThreadChannel).name : 
            'original';

        const thread = await channelToUseForThread.threads.create({
            name: newThreadName,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            message: { content: 'Starting new conversation thread' }
        });

        await thread.members.add(message.author.id);

        const treeDiagram = generateTreeDiagram(parentThreadName, newThreadName);
        const threadInfo = treeDiagram + `\n${summary}`;

        const embedSummary = new EmbedBuilder()
            .setTitle('Conversation thread')
            .setDescription(threadInfo);
        const summaryMessage = await thread.send({ embeds: [embedSummary] });

        const cachedMessageData: CachedMessageData = {
            messageId: summaryMessage.id,
            channelId: thread.id,
            data: {
                content: summary,
                isUserMessage: false,
                modelName: chatBot.modelName,
                pages: [summary],
                currentPageIndex: 0
            },
            isSummary: true
        };

        const newConversation = cacheStore.cache.conversations[newConversationId];
        if (newConversation) {
            newConversation.messages.push(cachedMessageData);
            newConversation.messages.push(...conversationHistory);
        }

        updateState({
            currentConversationId: newConversationId,
            activeChannel: thread.id,
            restoredConversation: null,
            restoredInstructions: null
        });

        setActiveChannel(thread);

        client.resetContext();
        client.setConversationHistory(apiMessages);

    } catch (error) {
        console.error('Error creating conversation thread:', error);
    }
}
