import {
  Message,
  MessageType,
  TextChannel,
  DMChannel,
  NewsChannel,
  ThreadChannel,
  Client,
  Interaction,
  Attachment,
  PartialMessage,
} from "discord.js";
import axios from "axios";
import sharp from "sharp";
import {
  chatBot,
  adminUserId,
  requireMention,
  MessageData,
  Conversation,
  CachedMessageData,
  cacheStore,
  updateState,
  getState,
  updateMessageCache,
  getActiveChannel,
  setActiveChannel,
  useWebSearch,
  toggleWebSearch,
} from "../../utilities";
import { ClientFactory } from "../../api-connections/factory";
import { commands } from "../../commands/handlers";
import { OCRService, WebScraperService } from "../../commands/handlers";
import { generateThreadName } from "../../commands/handlers";
import { defaultModelManager } from "../../utilities";
import { useVision } from "../../utilities/settings";
import { createPageButtons, createPageEmbed } from "./formatter";
import { handleMessageResponse } from "./generator";
import { SearchService } from '../search/service';

// Interfaces for generator.ts functionality
interface StreamManager {
  handleMessageResponse: (
    message: Message,
    userInput: string,
    imageUrls?: string[],
    cachedMessages?: any[],
    existingMessage?: Message
  ) => Promise<Message | null>;
}

// Export messageDataMap at the top level
export const messageDataMap = new Map<string, MessageData>();
const pageUpdateLocks = new Map<string, boolean>();

const stopCommand = new commands.StopCommand();
const threadCommand = new commands.ThreadCommand();

type TextBasedChannel = TextChannel | DMChannel | NewsChannel | ThreadChannel;

const isTextBasedChannel = (channel: any): channel is TextBasedChannel =>
  channel?.isTextBased() && "send" in channel && "sendTyping" in channel;

interface PreprocessedMessage {
  userInput: string;
  imageUrls: string[];
  isModelSwitch?: boolean;
  additionalData?: {
    attachments: Array<{
      type: "text" | "image";
      name: string;
      content: string;
    }>;
  };
}

export const extractModelTag = (url: string): string | null => {
  const ollamaMatch = url.match(/https:\/\/ollama\.com\/(.+)/);
  if (ollamaMatch) return ollamaMatch[1];

  const hfMatch = url.match(
    /https:\/\/huggingface\.co\/([^\/]+\/[^\/]+)\/blob\/main\/([^\/]+\.gguf)/
  );
  return hfMatch
    ? `hf.co/${hfMatch[1]}:${hfMatch[2].replace(".gguf", "")}`
    : null;
};

async function processAttachment(
  attachment: Attachment
): Promise<{ text?: string; image?: string }> {
  try {
    if (attachment.contentType?.startsWith("image/")) {
      if (!useVision) {
        const text = await OCRService.extractText(attachment.url);
        return text ? { text } : {};
      }

      const response = await axios.get(attachment.url, {
        responseType: "arraybuffer",
      });
      const processedImage = await sharp(response.data)
        .resize(800, 800, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer();

      return { image: processedImage.toString("base64") };
    }

    if (attachment.contentType?.startsWith("text/")) {
      const { data } = await axios.get(attachment.url);
      return { text: `File: ${attachment.name}\n${data}` };
    }
  } catch (error) {
    console.error(`Error processing attachment ${attachment.name}:`, error);
  }
  return {};
}

async function preprocessMessage(
  message: Message
 ): Promise<PreprocessedMessage> {
  const modelSwitch = message.content.match(/^\+\s+(.+)$/);
  if (modelSwitch) {
    // Handle model switching
    if (modelSwitch[1].trim() === 'search') {
      toggleWebSearch(true);
      await message.delete().catch(console.error);
      return {
        userInput: "",
        imageUrls: [],
        isModelSwitch: false,
        additionalData: { attachments: [] }
      };
    } else if (modelSwitch[1].trim() === 'model') {
      toggleWebSearch(false);
      await message.delete().catch(console.error);
      return {
        userInput: "",
        imageUrls: [],
        isModelSwitch: false,
        additionalData: { attachments: [] }
      };
    }
    
    try {
      const newModel = await findClosestModelMatch(modelSwitch[1]);
      if (!newModel) {
        return {
          userInput: message.content,
          imageUrls: [],
          additionalData: { attachments: [] },
        };
      }
  
      const state = getState();
      const conversation = state.currentConversationId
        ? cacheStore.cache.conversations[state.currentConversationId]
        : null;
  
      await message.delete();
  
      const newClient = ClientFactory.getClient(newModel);
      newClient.modelName = newModel;
  
      // Only get messages from current thread/channel
      const threadHistory = conversation?.messages
        .filter(msg => msg.channelId === message.channel.id)
        .map(msg => ({
          role: msg.data.isUserMessage ? "user" : "assistant",
          content: msg.data.content,
        })) || [];
  
      // Set up the new client
      newClient.setSystem(conversation?.systemPrompt || null);
      newClient.setTemperature(chatBot.temperature);
      newClient.setConversationHistory(threadHistory);
  
      // Update chatBot state
      chatBot.modelName = newModel;
      chatBot.setSystem(conversation?.systemPrompt || null);
      chatBot.setTemperature(chatBot.temperature);
      chatBot.setConversationHistory(threadHistory);
  
      message.client.user?.setActivity(newModel);
  
      updateState({
        lastUsedModel: newModel,
        lastSystemPrompt: conversation?.systemPrompt || null,
        lastTemperature: chatBot.temperature,
      });
  
      return {
        userInput: "",
        imageUrls: [],
        isModelSwitch: true,
        additionalData: { attachments: [] },
      };
    } catch (error) {
      return {
        userInput: message.content,
        imageUrls: [],
        additionalData: { attachments: [] },
      };
    }
  }
 
  // Check for web search toggle commands
  if (message.content.trim() === 'model') {
    toggleWebSearch(false);
    await message.delete().catch(console.error);
    return {
      userInput: "",
      imageUrls: [],
      isModelSwitch: false,
      additionalData: { attachments: [] }
    };
  }
 
  let userInput = message.content;
  const imageUrls: string[] = [];
  const textAttachments: string[] = [];
 
  const attachmentsData: Array<{
    type: "text" | "image";
    name: string;
    content: string;
  }> = [];
 
  // If web search is enabled and there are no URLs in the message yet,
  // try to find a relevant archive URL to add
  let urls = userInput.match(/(https?:\/\/[^\s]+)/g);
  if (useWebSearch && !urls && userInput.length > 10) {
    try {
      // Extract better keywords for search - focus on nouns and important terms
      const keywords = userInput
        .replace(/[?.,!;:]/g, '')
        .split(' ')
        .filter(word => word.length > 1)
        .join(' ')
        .trim();
      
      // Use vector search to get relevant content
      const vectorSearchResult = await SearchService.getRelevantContentWithVectorSearch(keywords);
      
      if (vectorSearchResult) {
        userInput += `\n\nThe following is information retrieved from a web search as of today (${new Date().toLocaleDateString()}):\n\n${vectorSearchResult}. Ignore irrelevant information and do not mention it in your response.`;
      } else {
        // Fallback to traditional search if vector search found nothing
        const archiveUrls = await SearchService.getTopWikipediaUrls(keywords, 1);
        const archiveUrl = archiveUrls[0];
        
        if (archiveUrl) {
          urls = [archiveUrl]; // Set urls to include the found URL
        } else {
          userInput += "\n\nNote: I searched for relevant information but found no results.";
        }
      }
    } catch (error) {
      console.error("Error in archive search:", error);
    }
  }
  
  // Process URLs (either from the original message or from the archive search)
  if (urls) {
    await Promise.all(
      urls.map(async (url) => {
        try {
          // console.log(`Scraping content from URL: ${url}`);
          const content = await WebScraperService.scrapeContent(url);
          
          // Only add scraped content if we actually got something useful
          if (content && content.length > 50) {
            // If this is a search result, add a more user-friendly message
            if (useWebSearch && !userInput.includes(url)) {
              userInput += `\n\nI found some relevant information for your query:\n`;
              userInput += `Source: ${url}\n\n${content}`;
            } else {
              // Regular URL in user message
              userInput = userInput.replace(
                url,
                `\n\nScraped content from ${url}:\n${content}`
              );
            }
          } else {
            // console.log(`Scraping returned insufficient content from ${url}`);
            // Maybe inform user that the page couldn't be scraped properly
            if (useWebSearch) {
              userInput += `\n\nI found a potentially relevant page (${url}) but couldn't extract useful content.`;
            }
          }
        } catch (error) {
          console.error(`Error scraping URL ${url}:`, error);
        }
      })
    );
  }
 
  if (message.attachments.size) {
    const results = await Promise.all(
      Array.from(message.attachments.values()).map(processAttachment)
    );
 
    results.forEach((result, index) => {
      const attachment = Array.from(message.attachments.values())[index];
      if (result.text) {
        textAttachments.push(result.text);
        attachmentsData.push({
          type: "text",
          name: attachment?.name || "unknown",
          content: result.text,
        });
      }
      if (result.image) {
        imageUrls.push(result.image);
        attachmentsData.push({
          type: "image",
          name: attachment?.name || "unknown",
          content: result.image,
        });
      }
    });
  }
 
  if (textAttachments.length) {
    userInput += `\n\nText Attachments:\n${textAttachments.join("\n\n")}`;
  }
 
  if (message.reference?.messageId) {
    try {
      const repliedMessage = await message.channel.messages.fetch(
        message.reference.messageId
      );
      if (repliedMessage) {
        const repliedContent =
          repliedMessage.embeds[0]?.description || repliedMessage.content;
        userInput += `\n\nReplied Message:\n${repliedContent}`;
      }
    } catch (error) {
      console.error("Error fetching replied message:", error);
    }
  }
 
  return {
    userInput,
    imageUrls,
    additionalData: { attachments: attachmentsData },
  };
 }

export async function handleMessageUpdate(
  oldMessage: Message,
  newMessage: Message
) {
  if (oldMessage.author.bot || oldMessage.content === newMessage.content)
    return;

  // Search through all conversations
  const conversations = Object.values(cacheStore.cache.conversations);
  let targetConversation: Conversation | null = null;
  let messageIndex = -1;

  for (const conv of conversations) {
    messageIndex = conv.messages.findIndex(
      (msg) =>
        msg &&
        msg.messageId === oldMessage.id &&
        msg.channelId === oldMessage.channelId
    );
    if (messageIndex !== -1) {
      targetConversation = conv;
      break;
    }
  }

  if (!targetConversation || messageIndex === -1) return;

  try {
    const messageData = targetConversation.messages[messageIndex].data;
    if (!messageData) return;

    messageData.content = newMessage.content;
    updateMessageCache(
      oldMessage.id,
      oldMessage.channelId,
      newMessage.content,
      true
    );

    if (chatBot.modelName) {
      const client = ClientFactory.getClient(chatBot.modelName);
      client.updateInHistory(oldMessage.content, newMessage.content);
    }

    const botResponse = targetConversation.messages[messageIndex + 1];
    if (botResponse && !botResponse.data.isUserMessage) {
      const { userInput } = await preprocessMessage(newMessage);
      const cachedMessages = targetConversation.messages
        .slice(0, messageIndex + 1)
        .map((msg) => ({
          role: msg.data.isUserMessage ? "user" : "assistant",
          content: msg.data.content,
        }));

      if (isTextBasedChannel(newMessage.channel)) {
        try {
          const botMessage = await newMessage.channel.messages.fetch(
            botResponse.messageId
          );
          if (botMessage) {
            messageDataMap.delete(botMessage.id);
            await handleMessageResponse(
              newMessage,
              userInput,
              undefined,
              cachedMessages,
              botMessage
            );
            return;
          }
        } catch (error) {
          console.error("Error fetching bot message:", error);
        }
      }
      await handleMessageResponse(
        newMessage,
        userInput,
        undefined,
        cachedMessages
      );
    }
  } catch (error) {
    console.error("Error handling edited message:", error);
    await newMessage
      .reply("An error occurred while processing your edit.")
      .catch(console.error);
  }
}

export async function handleMessageCreate(message: Message) {
  if (message.author.bot || message.type === MessageType.ThreadCreated) return;
  if (requireMention && !message.mentions.has(message.client.user!.id)) return;

  if (message.reference && message.content.toLowerCase() === "branch") {
    await threadCommand.execute({
      message,
      isThread: message.channel.isThread(),
    });
    return;
  }

  const modelTag = extractModelTag(message.content);
  if (modelTag) {
    if (message.channel.isThread()) {
      await message.reply(
        "Model pulling can only be done in the main channel, not in threads."
      );
      return;
    }
    if (!adminUserId || message.author.id !== adminUserId) {
      await message.reply("You do not have permission to pull models.");
      return;
    }
    await defaultModelManager
      .handleModelPull(message, modelTag)
      .catch((error: any) => {
        console.error("Error handling model pull:", error);
        message.reply("An error occurred while pulling the model.");
      });
    return;
  }

  if (message.channel.isThread()) {
    const activeChannel = getActiveChannel();
    if (!activeChannel || message.channelId !== activeChannel.id) {
      const conversation = Object.values(cacheStore.cache.conversations).find(
        (conv): conv is Conversation =>
          "messages" in conv &&
          conv.messages.some(
            (msg: CachedMessageData) => msg.channelId === message.channelId
          )
      );

      if (conversation) {
        await setActiveChannel(message.channel);
        if (chatBot.modelName) {
          const client = ClientFactory.getClient(chatBot.modelName);
          client.resetContext();

          if (conversation.systemPrompt !== undefined) {
            client.setSystem(conversation.systemPrompt);
            chatBot.system = conversation.systemPrompt;
          } else {
            client.clearSystem();
            chatBot.system = null;
          }

          client.setConversationHistory(
            conversation.messages.map((msg) => ({
              role: msg.data.isUserMessage ? "user" : "assistant",
              content: msg.data.content,
            }))
          );
          message.client.user?.setActivity(chatBot.modelName);
        }
        updateState({
          currentConversationId: conversation.id,
          activeChannel: message.channelId,
        });
      }
    }
  }

  const activeChannel = getActiveChannel();
  if (!activeChannel || message.channel.id !== activeChannel.id) return;

  const state = getState();
  if (!state.currentConversationId) return;
  
  const currentConversation = cacheStore.cache.conversations[state.currentConversationId];
  if (!currentConversation) return;
  
  // Only cache messages that belong to this conversation's thread
  const conversationChannelId = currentConversation.messages[0]?.channelId;
  if (conversationChannelId && message.channelId !== conversationChannelId) return;
  
  try {
    const processed = await preprocessMessage(message);
    if (
      processed.isModelSwitch ||
      (await stopCommand.execute({
        message,
        isThread: message.channel.isThread(),
      }))
    )
      return;

    if (processed.userInput) {
      if (message.channel.isThread()) {
        const threadChannel = message.channel as ThreadChannel;
        if (
          threadChannel.name === "new-thread" ||
          threadChannel.name === "conversation"
        ) {
          const threadName = generateThreadName(processed.userInput);
          if (threadName) {
            try {
              await threadChannel.setName(threadName);
            } catch (error) {
              console.error("Error updating thread name:", error);
            }
          }
        }
      }

      const { userInput, imageUrls, additionalData } = processed;
      const state = getState();
      const conversation = state.currentConversationId
        ? cacheStore.cache.conversations[state.currentConversationId]
        : null;

      updateMessageCache(message.id, message.channelId, userInput, true, {
        attachments: additionalData?.attachments || [],
      });

      const cachedMessages =
        conversation?.messages
          .filter(
            (msg: CachedMessageData, i: number, arr: CachedMessageData[]) =>
              !(i === arr.length - 1 && msg.data.content === userInput)
          )
          .map((msg: CachedMessageData) => ({
            role: msg.data.isUserMessage ? "user" : "assistant",
            content: msg.data.content,
            attachments: msg.data.attachments,
          })) ?? [];

      await handleMessageResponse(
        message,
        userInput,
        imageUrls,
        cachedMessages
      );
    }
  } catch (error) {
    if (!axios.isCancel(error)) {
      console.error("Error generating response:", error);
      await message.reply(
        error instanceof Error && error.message.includes("429")
          ? "```\nError 429: Rate Limit Exceeded\n```"
          : "An error occurred while generating the response. Please try again or contact an administrator."
      );
    }
  }
}

export async function findClosestModelMatch(
  input: string
): Promise<string | null> {
  try {
    const modelDirectories = await defaultModelManager.loadModelDirectories();
    const models = Object.keys(modelDirectories);

    // Direct match check first
    const exactMatch = models.find((model) =>
      model.toLowerCase().includes(input.toLowerCase())
    );
    if (exactMatch) return exactMatch;

    // Fuzzy match if no exact match found
    const bestMatch = models.reduce((best, model) => {
      // Split model name into parts for flexible matching
      const modelParts = model.toLowerCase().split(/[-\/\.]/);
      const inputParts = input.toLowerCase().split(/[-\/\.]/);

      // Score based on how many parts of the input match parts of the model name
      const score = inputParts.reduce((sum, part) => {
        return (
          sum + (modelParts.some((m) => m.includes(part)) ? part.length : 0)
        );
      }, 0);

      return score > (best?.score || 2) ? { model, score } : best;
    }, null as null | { model: string; score: number });

    return bestMatch?.model || null;
  } catch (error) {
    console.error("Error finding model match:", error);
    return null;
  }
}

export function setupGlobalMessageCollector(
  client: Client,
  messageDataMap: Map<string, MessageData>
) {
  client.on("interactionCreate", async (interaction: Interaction) => {
    if (!interaction.isButton()) return;

    const message = interaction.message as Message;

    const updateLock = `page_update_${message.id}`;
    if (pageUpdateLocks.get(updateLock)) return;
    pageUpdateLocks.set(updateLock, true);

    try {
      let currentData = null;
      const conversations = Object.values(cacheStore.cache.conversations);
      for (const conv of conversations) {
        const typedConv = conv as Conversation;
        const cachedMsg = typedConv.messages.find(
          (msg: CachedMessageData) => msg.messageId === message.id
        );
        if (cachedMsg) {
          currentData = { ...cachedMsg.data };
          break;
        }
      }

      if (!currentData?.pages || !Array.isArray(currentData.pages)) {
        return;
      }

      const { customId } = interaction;
      const currentIndex = currentData.currentPageIndex ?? 0;
      let nextIndex = currentIndex;

      if (customId === "previous") {
        nextIndex = Math.max(0, currentIndex - 1);
      } else if (customId === "next") {
        nextIndex = Math.min(currentData.pages.length - 1, currentIndex + 1);
      }

      if (nextIndex !== currentIndex) {
        currentData.currentPageIndex = nextIndex;
        const updatedEmbed = createPageEmbed(currentData, true);
        const updatedRow = createPageButtons(currentData);

        await interaction.update({
          embeds: [updatedEmbed],
          components: [updatedRow],
        });

        messageDataMap.set(message.id, { ...currentData });

        for (const conversation of conversations) {
          const typedConv = conversation as Conversation;
          const cachedMessage = typedConv.messages.find(
            (msg) => msg.messageId === message.id
          );
          if (cachedMessage) {
            cachedMessage.data = { ...currentData };
            await cacheStore.saveCache();
            break;
          }
        }
      }
    } catch (error) {
      console.error("Error updating page:", error);
    } finally {
      pageUpdateLocks.delete(updateLock);
    }
  });

  client.on("messageCreate", (message: Message) => {
    if (!message.author.bot) {
      const activeChannel = cacheStore.getState().activeChannel;
      if (activeChannel && message.channelId === activeChannel) {
        updateMessageCache(
          message.id,
          message.channelId,
          message.content,
          true
        );
      }
    }
  });

  client.on("messageDelete", async (message: Message | PartialMessage) => {
    try {
      if (message.channel?.isThread()) {
        const state = cacheStore.getState();
        if (state.currentConversationId) {
          const conversation = cacheStore.cache.conversations[
            state.currentConversationId
          ] as Conversation;
          if (conversation && conversation.messages) {
            const messageIndex = conversation.messages.findIndex(
              (msg: CachedMessageData) => msg.messageId === message.id
            );
            if (messageIndex !== -1) {
              const deletedContent =
                conversation.messages[messageIndex].data.content;
              conversation.messages.splice(messageIndex, 1);
              cacheStore.saveCache();

              if (
                message.client.user &&
                message.mentions?.has(message.client.user)
              ) {
                const nextMessage = conversation.messages[messageIndex];
                if (nextMessage && !nextMessage.data.isUserMessage) {
                  const botMessage = await message.channel.messages
                    .fetch(nextMessage.messageId)
                    .catch(() => null);
                  if (botMessage) {
                    await botMessage.delete().catch(console.error);
                    conversation.messages.splice(messageIndex, 1);
                    cacheStore.saveCache();
                  }
                }
              }
            }
          }
        }
        messageDataMap.delete(message.id);
      }
    } catch (error) {
      console.error("Error handling message deletion:", error);
    }
  });
}

export function initializeMessageHandling(client: Client) {
  setupGlobalMessageCollector(client, messageDataMap);

  client.on("messageCreate", handleMessageCreate);

  client.on("messageUpdate", async (oldMessage, newMessage) => {
    try {
      const fetchedOldMessage = oldMessage.partial
        ? await oldMessage.fetch()
        : oldMessage;
      const fetchedNewMessage = newMessage.partial
        ? await newMessage.fetch()
        : newMessage;
      await handleMessageUpdate(
        fetchedOldMessage as Message,
        fetchedNewMessage as Message
      );
    } catch (error) {
      console.error("Error handling message update:", error);
    }
  });
}
