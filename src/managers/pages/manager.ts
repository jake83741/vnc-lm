import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MessageData } from '../cache';
import { characterLimit } from '../../utilities';

export function addToPages(messageData: MessageData, content: string): void {
    // Initialize pages array if it doesn't exist
    if (!messageData.pages) {
        messageData.pages = [''];
    }
    
    // Define punctuation marks for splitting content
    const punctuationMarks = ['.', '!', '?', '\n'];
    let isInCodeBlock = false;
    let codeBlockLanguage = '';

    while (content.length > 0) {
        let splitPoint = -1;
        const lastPageIndex = messageData.pages.length - 1;
        const currentPageContent = messageData.pages[lastPageIndex] + content;

        // If content fits in the current page, add it and exit
        if (currentPageContent.length <= characterLimit) {
            messageData.pages[lastPageIndex] = currentPageContent;
            break;
        } else {
            // Find a suitable split point
            for (let i = characterLimit; i >= 0; i--) {
                if (punctuationMarks.includes(currentPageContent[i]) || 
                    currentPageContent.slice(i - 3, i) === '```') {
                    splitPoint = i + 1;
                    break;
                }
            }

            // If no suitable split point found, split at character limit
            if (splitPoint === -1) {
                splitPoint = characterLimit;
            }

            let pageContent = currentPageContent.slice(0, splitPoint);

            // Handle code blocks
            const codeBlockStarts = pageContent.match(/```(\w+)?/g) || [];
            const codeBlockEnds = pageContent.match(/```\s*$/g) || [];

            codeBlockStarts.forEach(start => {
                isInCodeBlock = true;
                codeBlockLanguage = start.slice(3) || codeBlockLanguage;
            });

            codeBlockEnds.forEach(() => {
                isInCodeBlock = false;
            });

            // Close open code blocks at page end
            if (isInCodeBlock && !pageContent.endsWith('```')) {
                pageContent += '\n```';
                isInCodeBlock = false;
            }

            messageData.pages[lastPageIndex] = pageContent;
            content = currentPageContent.slice(splitPoint).trim();

            // Start a new page if there's remaining content
            if (content.length > 0) {
                let newPageContent = '';
                if (codeBlockLanguage && !isInCodeBlock) {
                    newPageContent = '```' + codeBlockLanguage + '\n';
                    isInCodeBlock = true;
                }
                messageData.pages.push(newPageContent);
            }
        }
    }
}

export function createPageEmbed(messageData: MessageData, isComplete: boolean): EmbedBuilder {
    // Create a spinner effect for incomplete messages
    const spinnerEmojis = ['+', 'x', '*'];
    const emojiIndex = Math.floor(Date.now() / 500) % spinnerEmojis.length;
    const currentPage = messageData.pages && messageData.pages.length > 0
        ? messageData.pages[messageData.currentPageIndex || 0]
        : '';
    
    // Create and return the embed
    return new EmbedBuilder()
        .setDescription(currentPage)
        .setFooter({ 
            text: `${messageData.modelName || 'Unknown Model'}${!isComplete ? ` ${spinnerEmojis[emojiIndex]}` : ''}`
        });
}

export function createPageButtons(messageData: MessageData): ActionRowBuilder<ButtonBuilder> {
    // Create and return navigation buttons
    return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('previous')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(messageData.currentPageIndex === 0),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(messageData.currentPageIndex === (messageData.pages?.length || 1) - 1)
        );
}