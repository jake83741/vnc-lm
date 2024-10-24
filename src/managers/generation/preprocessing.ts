import axios from 'axios';
import { Message } from 'discord.js';
import { performOCR } from '../../services/ocr';
import { scrapeWebsite } from '../../services/scraper';

// Define the structure for the preprocessed message
interface PreprocessedMessage {
  userInput: string;
  imageUrls: string[];
}

export async function preprocessMessage(message: Message): Promise<PreprocessedMessage> {
  let userInput = message.content;
  let imageUrls: string[] = [];
  let textAttachments: string[] = [];

  // Process any URLs in the message
  userInput = await processUrls(userInput);

  // Process any attachments in the message
  const attachmentResult = await processAttachments(message);
  imageUrls = attachmentResult.imageUrls;
  textAttachments = attachmentResult.textAttachments;

  // Append text attachments to the user input
  if (textAttachments.length > 0) {
    userInput += `\n\nText Attachments:\n${textAttachments.join('\n\n')}`;
  }

  // Process any replied message
  userInput = await processRepliedMessage(message, userInput);

  return { userInput, imageUrls };
}

async function processUrls(input: string): Promise<string> {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = input.match(urlRegex);
  if (urls) {
    for (const url of urls) {
      // Scrape content from each URL and replace it in the input
      const scrapedContent = await scrapeWebsite(url);
      input = input.replace(url, `\n\nScraped content from ${url}:\n${scrapedContent}`);
    }
  }
  return input;
}

async function processAttachments(message: Message): Promise<{ imageUrls: string[], textAttachments: string[] }> {
  const imageUrls: string[] = [];
  const textAttachments: string[] = [];

  for (const attachment of message.attachments.values()) {
    if (attachment.contentType?.startsWith('image/')) {
      // Process image attachments
      imageUrls.push(attachment.url);
      const extractedText = await performOCR(attachment.url);
      if (extractedText) {
        textAttachments.push(`Extracted text from image ${attachment.name}:\n${extractedText}`);
      }
    } else if (attachment.contentType?.startsWith('text/')) {
      // Process text file attachments
      try {
        const response = await axios.get(attachment.url);
        textAttachments.push(`File: ${attachment.name}\n${response.data}`);
      } catch (error) {
        console.error(`Error processing text file attachment ${attachment.name}:`, error);
        textAttachments.push(`Error processing file: ${attachment.name}`);
      }
    }
  }

  return { imageUrls, textAttachments };
}

async function processRepliedMessage(message: Message, userInput: string): Promise<string> {
  if (message.reference && message.reference.messageId) {
    // Fetch the replied message if it exists
    const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
    if (repliedMessage) {
      let repliedContent = repliedMessage.content;
      // If the replied message has embeds, use the description of the first embed
      if (repliedMessage.embeds.length > 0) {
        repliedContent = repliedMessage.embeds[0].description || '';
      }
      // Append the replied message content to the user input
      userInput = `${userInput}\n\nReplied Message:\n${repliedContent}`;
    }
  }
  return userInput;
}