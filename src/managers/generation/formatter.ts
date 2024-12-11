import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { MessageData } from "../../utilities";
import { characterLimit } from "../../utilities";

const MARKDOWN_PATTERNS = {
  codeBlock: /```(\w+)?|\```/g,
  bold: /\*\*/g,
  italic: /\*(?!\*)/g,
  inlineCode: /`(?!``)/g,
};

const MARKDOWN_BOUNDARIES = {
  codeBlock: /```[\s\S]*?```|`{3}\w+[\s\S]*?`{3}/g,
  inlineCode: /`[^`]+`/g,
  boldItalic: /\*\*\*[\s\S]*?\*\*\*/g,
  bold: /\*\*[\s\S]*?\*\*/g,
  italic: /\*[\s\S]*?\*/g,
  strikethrough: /~~[\s\S]*?~~/g,
  underline: /__[\s\S]*?__/g,
};

interface MarkdownState {
  codeBlock: { isOpen: boolean; language: string };
  bold: boolean;
  italic: boolean;
  inlineCode: boolean;
}

function findMarkdownBoundaries(content: string, endIndex: number): number {
  const searchText = content.slice(0, endIndex);
  const allMatches = [];

  for (const [type, pattern] of Object.entries(MARKDOWN_BOUNDARIES)) {
    const matches = [...searchText.matchAll(new RegExp(pattern, "g"))];
    for (const match of matches) {
      if (match.index !== undefined) {
        allMatches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
        });
      }
    }
  }

  allMatches.sort((a, b) => a.start - b.start);

  for (const match of allMatches) {
    if (match.start < endIndex && match.end > endIndex) {
      return match.start;
    }
  }

  return endIndex;
}

function findOptimalSplitPoint(content: string, limit: number): number {
  if (content.length <= limit) return content.length;

  let splitPoint = -1;
  let lastNewline = -1;

  for (let i = limit; i >= Math.max(0, limit - 100); i--) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (/^[\*_`]*\d+\.$/.test(content.slice(Math.max(0, i - 5), i + 1))) {
      // Skip if the split point is on a numbered list item
      continue;
    }

    if (/^\*/.test(content.slice(i + 1))) {
      // Skip if the split point is on a bullet point
      continue;
    }

    if (/\s/.test(content[i]) && (i === 0 || /\S/.test(content[i - 1]))) {
      // Check if the split point is on a word boundary
      splitPoint = findMarkdownBoundaries(content, i + 1);
      break;
    }

    lastNewline = i;
  }

  if (splitPoint === -1) {
    splitPoint = findMarkdownBoundaries(
      content,
      lastNewline > 0 ? lastNewline + 1 : limit
    );
  }

  return splitPoint;
}

function cleanupMarkdown(content: string): string {
  // Remove single asterisks that aren't part of valid markdown
  return content.replace(/(?<!\*)\*(?!\*|\n)(?!.*\*)/g, "");
}

function updateMarkdownState(content: string, state: MarkdownState): void {
  const matches = {
    codeBlock: [...content.matchAll(MARKDOWN_PATTERNS.codeBlock)],
    bold: [...content.matchAll(MARKDOWN_PATTERNS.bold)],
    italic: [...content.matchAll(MARKDOWN_PATTERNS.italic)],
    inlineCode: [...content.matchAll(MARKDOWN_PATTERNS.inlineCode)],
  };

  matches.codeBlock.forEach((match) => {
    if (match[0].startsWith("```") && !state.codeBlock.isOpen) {
      state.codeBlock.isOpen = true;
      state.codeBlock.language = match[1] || "";
    } else if (match[0] === "```" && state.codeBlock.isOpen) {
      state.codeBlock.isOpen = false;
      state.codeBlock.language = "";
    }
  });

  state.bold = matches.bold.length % 2 !== 0 ? !state.bold : state.bold;
  state.italic = matches.italic.length % 2 !== 0 ? !state.italic : state.italic;
  state.inlineCode =
    matches.inlineCode.length % 2 !== 0 ? !state.inlineCode : state.inlineCode;
}

function getMarkdownPrefix(state: MarkdownState): string {
  let prefix = "";
  if (state.codeBlock.isOpen) {
    prefix += "```" + state.codeBlock.language + "\n";
  }
  if (state.bold) prefix += "**";
  if (state.italic) prefix += "*";
  if (state.inlineCode) prefix += "`";
  return prefix;
}

function getMarkdownSuffix(state: MarkdownState): string {
  let suffix = "";
  if (state.inlineCode) suffix = "`" + suffix;
  if (state.italic) suffix = "*" + suffix;
  if (state.bold) suffix = "**" + suffix;
  if (state.codeBlock.isOpen) suffix = "\n```" + suffix;
  return suffix;
}

export function addToPages(messageData: MessageData, content: string): void {
  if (!messageData.pages) {
    messageData.pages = [""];
  }

  const state: MarkdownState = {
    codeBlock: { isOpen: false, language: "" },
    bold: false,
    italic: false,
    inlineCode: false,
  };

  while (content) {
    const lastPageIndex = messageData.pages.length - 1;
    const currentPage = messageData.pages[lastPageIndex];
    const remainingSpace = characterLimit - currentPage.length;

    if (content.length <= remainingSpace) {
      messageData.pages[lastPageIndex] += cleanupMarkdown(content);
      break;
    }

    let splitPoint = findOptimalSplitPoint(content, remainingSpace);

    // Check if the split point is on a numbered list item
    while (
      /^[\*_`]*\d+\.$/.test(
        content.slice(Math.max(0, splitPoint - 5), splitPoint + 1)
      )
    ) {
      splitPoint = findOptimalSplitPoint(content, splitPoint - 1);
    }

    let pageContent = content.slice(0, splitPoint);

    updateMarkdownState(pageContent, state);
    pageContent = cleanupMarkdown(pageContent);
    pageContent += getMarkdownSuffix(state);

    // Ensure the last page doesn't end with an asterisk
    if (
      lastPageIndex === messageData.pages.length - 1 &&
      /\*$/.test(pageContent)
    ) {
      const lastAsteriskIndex = pageContent.lastIndexOf("*");
      pageContent =
        pageContent.slice(0, lastAsteriskIndex) +
        pageContent.slice(lastAsteriskIndex + 1);
    }

    messageData.pages[lastPageIndex] = currentPage + pageContent;
    content = content.slice(splitPoint);

    if (content) {
      let newPageContent = getMarkdownPrefix(state);
      messageData.pages.push(newPageContent);
    }
  }
}

export function createPageEmbed(
  messageData: MessageData,
  isComplete: boolean
): EmbedBuilder {
  const spinnerEmojis = ["+", "x", "*"];
  const emojiIndex = Math.floor(Date.now() / 500) % spinnerEmojis.length;

  return new EmbedBuilder()
    .setDescription(
      messageData.pages?.[messageData.currentPageIndex || 0] || ""
    )
    .setFooter({
      text: `${messageData.modelName || "Unknown Model"}${
        !isComplete ? ` ${spinnerEmojis[emojiIndex]}` : ""
      }`,
    });
}

export function createPageButtons(
  messageData: MessageData
): ActionRowBuilder<ButtonBuilder> {
  const totalPages = messageData.pages?.length || 1;
  const currentPage = messageData.currentPageIndex || 0;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("previous")
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId("next")
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === totalPages - 1)
  );
}
