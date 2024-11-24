import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MessageData } from '../../utilities/types';
import { characterLimit } from '../../utilities/settings';

// Cached markdown regex patterns
const MARKDOWN_PATTERNS = {
    codeBlock: /```(\w+)?|\```/g,
    bold: /\*\*/g,
    italic: /\*(?!\*)/g,
    inlineCode: /`(?!``)/g
};

// Track markdown state
interface MarkdownState {
    codeBlock: { isOpen: boolean; language: string };
    bold: boolean;
    italic: boolean;
    inlineCode: boolean;
}

function findOptimalSplitPoint(content: string, limit: number): number {
    if (content.length <= limit) return content.length;

    // Never split in the middle of a word - find last space before limit
    let i = Math.min(limit, content.length);
    
    // Scan back to find the last space/newline
    while (i > 0) {
        // Found a space or newline
        if (/[\s\n]/.test(content[i])) {
            // Check for our special cases
            const beforeText = content.slice(Math.max(0, i - 3), i);
            const afterText = content.slice(i, i + 3);
            const nextLine = content.slice(i + 1).split('\n')[0];

            // Skip if we're in the middle of markdown
            if (beforeText.includes('```') || afterText.includes('```')) {
                i--;
                continue;
            }

            // Skip if we're in a numbered list
            if (/^\d+\.\s*/.test(nextLine)) {
                i--;
                continue;
            }

            // Skip if we just ended with a colon
            if (content[i - 1] === ':') {
                i--;
                continue;
            }

            // Otherwise this is a good split point
            return i + 1;
        }
        i--;
    }

    // If we couldn't find a good split point, just return 0
    // This will force creating a new page
    return 0;
}

export function addToPages(messageData: MessageData, content: string): void {
    if (!messageData.pages) {
        messageData.pages = [''];
    }

    const state: MarkdownState = {
        codeBlock: { isOpen: false, language: '' },
        bold: false,
        italic: false,
        inlineCode: false
    };

    while (content) {
        const lastPageIndex = messageData.pages.length - 1;
        const currentPage = messageData.pages[lastPageIndex];
        const remainingSpace = characterLimit - currentPage.length;

        if (content.length <= remainingSpace) {
            messageData.pages[lastPageIndex] += content;
            break;
        }

        const splitPoint = findOptimalSplitPoint(content, remainingSpace);
        let pageContent = content.slice(0, splitPoint);

        // Update markdown state
        const matches = {
            codeBlock: [...pageContent.matchAll(MARKDOWN_PATTERNS.codeBlock)],
            bold: [...pageContent.matchAll(MARKDOWN_PATTERNS.bold)],
            italic: [...pageContent.matchAll(MARKDOWN_PATTERNS.italic)],
            inlineCode: [...pageContent.matchAll(MARKDOWN_PATTERNS.inlineCode)]
        };

        matches.codeBlock.forEach(match => {
            if (match[0].startsWith('```') && !state.codeBlock.isOpen) {
                state.codeBlock.isOpen = true;
                state.codeBlock.language = match[1] || '';
            } else if (match[0] === '```' && state.codeBlock.isOpen) {
                state.codeBlock.isOpen = false;
                state.codeBlock.language = '';
            }
        });

        state.bold = (matches.bold.length % 2) !== 0;
        state.italic = (matches.italic.length % 2) !== 0;
        state.inlineCode = (matches.inlineCode.length % 2) !== 0;

        // Close open markdown for page end
        if (state.codeBlock.isOpen) {
            pageContent += '\n```';
        }

        messageData.pages[lastPageIndex] = currentPage + pageContent;
        content = content.slice(splitPoint);

        // Start new page with correct markdown state
        if (content) {
            let newPageContent = '';
            if (state.codeBlock.isOpen) {
                newPageContent = '```' + state.codeBlock.language + '\n';
            }
            if (state.bold) newPageContent += '**';
            if (state.italic) newPageContent += '*';
            if (state.inlineCode) newPageContent += '`';
            
            messageData.pages.push(newPageContent);
            // Set current page to the newly created page
            messageData.currentPageIndex = messageData.pages.length - 1;
        }
    }
}

export function updatePageEmbed(messageData: MessageData, isComplete: boolean): EmbedBuilder {
    const spinnerEmojis = ['+', 'x', '*'];
    const emojiIndex = Math.floor(Date.now() / 500) % spinnerEmojis.length;
    
    return new EmbedBuilder()
        .setDescription(messageData.pages?.[messageData.currentPageIndex || 0] || '')
        .setFooter({ 
            text: `${messageData.modelName || 'Unknown Model'}${!isComplete ? ` ${spinnerEmojis[emojiIndex]}` : ''}`
        });
}

export function createPageButtons(messageData: MessageData): ActionRowBuilder<ButtonBuilder> {
    const totalPages = messageData.pages?.length || 1;
    const currentPage = messageData.currentPageIndex || 0;

    return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('previous')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === totalPages - 1)
        );
}

export interface PageManager {
    addToPages: typeof addToPages;
    updatePageEmbed: typeof updatePageEmbed;
    createPageButtons: typeof createPageButtons;
}

export const pageManager: PageManager = {
    addToPages,
    updatePageEmbed,
    createPageButtons
};
