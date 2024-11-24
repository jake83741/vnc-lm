import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MessageData } from '../../utilities';
import { characterLimit } from '../../utilities';

// Cached markdown regex patterns
const MARKDOWN_PATTERNS = {
    codeBlock: /```(\w+)?|\```/g,
    bold: /\*\*/g,
    italic: /\*(?!\*)/g,
    inlineCode: /`(?!``)/g
};

// Smart content splitter function
function findOptimalSplitPoint(content: string, limit: number): number {
    if (content.length <= limit) return content.length;

    // Check within a reasonable range before limit
    for (let i = limit; i >= Math.max(0, limit - 100); i--) {
        const char = content[i];
        const nextChar = content[i + 1];
        
        // Don't split if we're in the middle of a numbered list item (with or without markdown)
        if (/^[\*_`]*\d+\.$/.test(content.slice(Math.max(0, i-5), i+1))) {
            continue;
        }

        // Avoid splitting markdown
        if (content.slice(i - 3, i) === '```' || 
            content.slice(i, i + 3) === '```') continue;
            
        // Avoid splitting numbers in lists
        if (/^\d+\.\s*$/.test(content.slice(i + 1).split('\n')[0])) continue;

        // Good split points: exclamation mark, question mark, or newline followed by space or newline
        if (('!?\n'.includes(char) && (nextChar === ' ' || nextChar === '\n')) ||
            (char === '\n' && !content.slice(i + 1, i + 10).trim().startsWith('1.'))) {
            return i + 1;
        }
    }

    // Fallback to last complete line
    const lastNewline = content.slice(0, limit).lastIndexOf('\n');
    return lastNewline > 0 ? lastNewline + 1 : limit;
}

// Track markdown state
interface MarkdownState {
    codeBlock: { isOpen: boolean; language: string };
    bold: boolean;
    italic: boolean;
    inlineCode: boolean;
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
        }
    }
}

export function createPageEmbed(messageData: MessageData, isComplete: boolean): EmbedBuilder {
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
