import {
  EmbedBuilder,
  TextChannel,
  ThreadChannel,
  ChannelType,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { Readable } from "stream";
import axios, { AxiosError } from "axios";
import { Message } from "discord.js";
import keyword_extractor from "keyword-extractor";
import { createWorker } from "tesseract.js";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { BaseCommand, CommandContext, ModelCommandParams } from "./base";
import {
  updateState,
  setActiveChannel,
  createNewConversation,
  chatBot,
  cacheStore,
  BotSettings,
  adminUserId,
  defaultNumCtx,
  Conversation,
  CachedMessageData,
} from "../utilities";
import { ClientFactory } from "../api-connections/factory";
import { OllamaClient } from "../api-connections/provider/ollama/client";
import { LiteLLMClient } from "../api-connections/provider/litellm/client";
import { ModelDirectories } from "../utilities/index";
import { refreshModelLibrary } from "../bot";

export type { ModelDirectories } from "../utilities/index";

// Service Classes
interface ExtendedModelDirectories extends ModelDirectories {
  [key: string]: string & { source?: "ollama" | "litellm" };
}

export class ModelManager {
  private ollamaClient: OllamaClient;
  private liteLLMClient: LiteLLMClient;
  private liteLLMUrl: string;
  private static hasInitialized = false;
  private maxRetries = 5;
  private retryDelay = 2000;
  public modelSources: Map<string, "ollama" | "litellm"> = new Map();

  constructor(baseUrl?: string, liteLLMUrl: string = "http://litellm:4000") {
    this.ollamaClient = new OllamaClient(baseUrl);
    this.liteLLMClient = new LiteLLMClient(liteLLMUrl);
    this.liteLLMUrl = liteLLMUrl;
  }

  private async waitForLiteLLM(): Promise<boolean> {
    if (ModelManager.hasInitialized) {
      return true;
    }

    for (let i = 0; i < this.maxRetries; i++) {
      try {
        await axios.get(`${this.liteLLMUrl}/health`);
        ModelManager.hasInitialized = true;
        return true;
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
      }
    }
    return false;
  }

  public async loadModelDirectories(): Promise<ExtendedModelDirectories> {
    const modelDirectories: ExtendedModelDirectories = {};

    await this.loadLiteLLMModels(modelDirectories);

    try {
      const response = await axios.get(
        "http://host.docker.internal:11434/api/tags",
        { timeout: 5000 }
      );

      if (response.data?.models) {
        response.data.models
          .map((model: { name: string }) => model.name)
          .sort()
          .forEach((modelName: string) => {
            modelDirectories[modelName] = modelName;
            this.modelSources.set(modelName, "ollama");
          });
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNREFUSED") {
        } else {
          console.error("Error loading Ollama models:", error);
        }
      } else {
        console.error("Error loading Ollama models:", error);
      }
    }

    return Object.keys(modelDirectories)
      .sort()
      .reduce((sorted: ExtendedModelDirectories, key: string) => {
        sorted[key] = modelDirectories[key];
        return sorted;
      }, {});
  }

  private async loadLiteLLMModels(modelDirectories: ExtendedModelDirectories) {
    try {
      if (!ModelManager.hasInitialized) {
        await this.waitForLiteLLM();
      }

      const response = await axios.get(`${this.liteLLMUrl}/v1/models`, {
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
      });

      if (response.data?.data) {
        response.data.data
          .map((model: { id: string }) => model.id)
          .sort()
          .forEach((modelName: string) => {
            modelDirectories[modelName] = modelName;
            this.modelSources.set(modelName, "litellm");
          });
      }
    } catch (error) {
      console.error("Error loading LiteLLM models:", error);
    }
  }

  public async loadModel(modelName: string): Promise<void> {
    try {
      if (this.modelSources.get(modelName) === "ollama") {
        await this.ollamaClient.generate({
          model: modelName,
          prompt: "",
          temperature: 0,
          options: { num_ctx: 2048 },
        });
        return;
      }

      const modelsResponse = await axios.get(`${this.liteLLMUrl}/v1/models`);
      const availableModels =
        modelsResponse.data?.data?.map((model: any) => model.id) || [];

      if (!availableModels.includes(modelName)) {
        throw new Error(`Model ${modelName} not found in LiteLLM proxy`);
      }
    } catch (error) {
      this.handleModelError(error, modelName);
    }
  }

  public async handleModelPull(
    message: Message,
    modelTag: string
  ): Promise<void> {
    if (!adminUserId || message.author.id !== adminUserId) {
      await message.reply("You do not have permission to pull models.");
      return;
    }

    const displayModelName = modelTag.split(":").pop() || modelTag;
    const embed = new EmbedBuilder().setFooter({
      text: `pulling ${displayModelName}`,
    });
    const reply = await message.reply({ embeds: [embed] });

    try {
      const stream = await this.pullModel(modelTag);
      let statusHistory: string[] = [];
      let lastStatusLine = "";

      for await (const chunk of stream) {
        const jsonObjects = chunk
          .toString()
          .split("\n")
          .filter((str: string) => str.trim());

        for (const jsonStr of jsonObjects) {
          try {
            const status = JSON.parse(jsonStr);
            let statusLine = status.status;

            if (
              status.status === "downloading" &&
              typeof status.completed === "number" &&
              typeof status.total === "number"
            ) {
              const progress = (
                (status.completed / status.total) *
                100
              ).toFixed(2);
              statusLine = `downloading (${progress}%)`;
            }

            if (statusLine !== lastStatusLine) {
              statusHistory.push(statusLine);
              statusHistory = statusHistory.slice(-10);
              lastStatusLine = statusLine;

              this.updateEmbed(embed, statusHistory, displayModelName);
              await reply.edit({ embeds: [embed] });
            }

            if (status.status === "success") {
              if (modelTag.startsWith("hf.co/")) {
                const newModelName = modelTag.split(":").pop() || modelTag;
                await this.copyModel(modelTag, newModelName);
                await this.deleteModel(modelTag);
              }

              this.updateEmbed(embed, statusHistory, displayModelName, true);
              await reply.edit({ embeds: [embed] });
              await refreshModelLibrary();
              return;
            }
          } catch (parseError) {
            console.error("Error parsing JSON:", parseError);
          }
        }
      }
    } catch (error) {
      console.error("Error pulling model:", error);
      this.updateEmbed(
        embed,
        ["An error occurred while pulling the model."],
        displayModelName,
        false,
        true
      );
      await reply.edit({ embeds: [embed] });
    }
  }

  public async pullModel(modelTag: string): Promise<Readable> {
    if (modelTag.includes("ollama.com") || !modelTag.includes("litellm")) {
      return await this.ollamaClient.pullModel(modelTag);
    }
    throw new Error("LiteLLM model pulling is not supported.");
  }

  public async deleteModel(modelName: string): Promise<void> {
    if (modelName.startsWith("litellm")) {
      throw new Error("Only local Ollama models can be deleted");
    }
    await this.ollamaClient.deleteModel(modelName);
  }

  public async copyModel(source: string, destination: string): Promise<void> {
    if (!source.includes("litellm")) {
      await this.ollamaClient.copyModel(source, destination);
    }
  }

  private handleModelError(error: any, modelName: string): never {
    if (axios.isAxiosError(error)) {
      const errorData = error.response?.data;
      if (error.response?.status === 429) {
        const waitTime =
          errorData?.error?.details?.match(/wait (\d+) seconds/)?.[1] ||
          "unknown";
        throw new Error(
          `Rate limit exceeded for model ${modelName}. Please wait ${waitTime} seconds.`
        );
      }
      throw new Error(
        `LiteLLM error: ${
          errorData?.error?.message || errorData?.message || error.message
        }`
      );
    }
    throw error instanceof Error
      ? error
      : new Error(`Failed to load model: ${String(error)}`);
  }

  private updateEmbed(
    embed: EmbedBuilder,
    statusHistory: string[],
    modelName: string,
    success = false,
    error = false
  ) {
    const description = "```console\n" + statusHistory.join("\n") + "\n```";
    embed.setDescription(description);

    if (success) {
      embed.setFooter({ text: `${modelName} pulled successfully` });
    } else if (error) {
      embed.setFooter({ text: `Failed to pull ${modelName}` });
    } else {
      const spinnerEmojis = ["+", "x", "*"];
      const emojiIndex = Math.floor(Date.now() / 500) % spinnerEmojis.length;
      embed.setFooter({
        text: `pulling ${modelName} ${spinnerEmojis[emojiIndex]}`,
      });
    }
  }
}

export class OCRService {
  public static async extractText(imageUrl: string): Promise<string | null> {
    try {
      const worker = await createWorker("eng");
      const {
        data: { text },
      } = await worker.recognize(imageUrl);
      await worker.terminate();
      return text;
    } catch (error) {
      console.error("OCR Error:", error);
      return null;
    }
  }
}

export class WebScraperService {
  public static async scrapeContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url);
      const dom = new JSDOM(response.data, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article) {
        return article.textContent.replace(/\s+/g, " ").trim();
      }
      return "Failed to extract article content.";
    } catch (error) {
      console.error("Scraping Error:", error);
      return "Failed to scrape website content.";
    }
  }
}

// Command Classes
export class ModelCommand extends BaseCommand {
  private modelManager: ModelManager;

  constructor(modelManager: ModelManager) {
    super({
      name: "model",
      description: "Load, configure, or remove a language model",
    });
    this.modelManager = modelManager;
  }

  async execute(context: CommandContext) {
    const { interaction } = context;
    if (!interaction) return;

    await interaction.deferReply({ ephemeral: true });

    const params: ModelCommandParams = {
      modelName: interaction.options.get("model")?.value as string,
      numCtx: interaction.options.get("num_ctx")?.value as number | undefined,
      systemPrompt: interaction.options.get("system_prompt")?.value as
        | string
        | undefined,
      temperature: interaction.options.get("temperature")?.value as
        | number
        | undefined,
      remove: interaction.options.get("remove")?.value as boolean,
    };

    if (params.remove) {
      await this.handleModelRemoval(context, params.modelName);
      return;
    }

    await this.handleModelLoad(context, params);
  }

  private async handleModelLoad(
    context: CommandContext,
    params: ModelCommandParams
  ) {
    const { interaction } = context;
    if (!interaction) return;

    updateState({
      restoredConversation: null,
      restoredInstructions: null,
    });

    const newConversationId = createNewConversation();
    const client = ClientFactory.getClient(params.modelName);

    // Configure client
    client.modelName = params.modelName;
    client.resetContext();
    client.clearSystem();
    client.setTemperature(params.temperature ?? chatBot.temperature);

    if (params.systemPrompt) {
      client.setSystem(params.systemPrompt);
    }
    if (params.numCtx !== null && "setNumCtx" in client) {
      (client as any).setNumCtx(params.numCtx);
    }

    // Update chatBot state
    chatBot.modelName = params.modelName;
    chatBot.temperature = params.temperature ?? chatBot.temperature;
    if ("numCtx" in client) {
      (chatBot as any).numCtx = (client as any).numCtx;
    }

    // Update bot activity
    if (interaction.client.user) {
      interaction.client.user.setActivity(`${params.modelName}`);
    }

    // Update state
    updateState({
      lastUsedModel: params.modelName,
      lastTemperature: params.temperature ?? chatBot.temperature,
      lastNumCtx: params.numCtx ?? defaultNumCtx,
      currentConversationId: newConversationId,
    });

    try {
      await this.sendResponse(context, "The model is loading.", true);
      await this.modelManager.loadModel(params.modelName);
      await this.sendResponse(context, "The model has loaded.", true);

      // Create thread
      if (interaction.channel?.type === ChannelType.GuildText) {
        const threadName = generateThreadName(
          params.systemPrompt || "New Conversation"
        );
        const thread = await this.createThread(
          interaction.channel as TextChannel,
          threadName,
          `Model conversation: ${params.modelName}`
        );

        if (thread) {
          setActiveChannel(thread as any);
        }
      }
    } catch (error) {
      console.error(`Error loading model:`, error);
      await this.sendResponse(
        context,
        `There was an issue loading the model ${params.modelName}.`,
        true
      );
    }
  }
  private async handleModelRemoval(context: CommandContext, modelName: string) {
    if (!(await this.checkPermissions(context, adminUserId))) {
      await this.sendResponse(
        context,
        "You do not have permission to remove models.",
        true
      );
      return;
    }

    try {
      await this.modelManager.deleteModel(modelName);

      if (chatBot.modelName === modelName) {
        chatBot.modelName = null;
        if (context.interaction?.client.user) {
          context.interaction.client.user.setActivity(
            "no active model, use /model"
          );
        }
        updateState({
          lastUsedModel: null,
          lastSystemPrompt: null,
          lastTemperature: null,
          lastNumCtx: null,
        });
      }

      await refreshModelLibrary();

      await this.sendResponse(
        context,
        `The model ${modelName} has been removed.`,
        true
      );
    } catch (error) {
      await this.sendResponse(
        context,
        `Failed to remove model ${modelName}.`,
        true
      );
    }
  }
}

export class HelpCommand extends BaseCommand {
  constructor() {
    super({ name: "help", description: "Get usage instructions" });
  }

  async execute(context: CommandContext) {
    const helpEmbed = buildHelpEmbed();
    await this.sendResponse(context, helpEmbed, true);
  }
}

export class StopCommand extends BaseCommand {
  constructor() {
    super({ name: "stop", description: "Stop current generation" });
  }

  async execute(context: CommandContext): Promise<void> {
    const { message } = context;
    if (!message) return;

    if (BotSettings.currentRequest) {
      try {
        if (chatBot.modelName) {
          const client = ClientFactory.getClient(chatBot.modelName);
          await client.cancelRequest("Generation stopped by user");
        }

        await message.delete().catch(console.error);
      } catch (error) {
        console.error("Error handling stop command:", error);
      } finally {
        BotSettings.currentRequest = null;
      }
    }
  }
}

export class ThreadCommand extends BaseCommand {
  constructor() {
    super({ name: "thread", description: "Create a new conversation branch" });
  }

  async execute(context: CommandContext) {
    const { message } = context;
    if (!message?.reference) return;

    try {
      await message.delete();
    } catch (error) {
      console.error("Failed to delete thread command:", error);
    }

    const repliedToMessage = await message.channel.messages.fetch(
      message.reference.messageId!
    );
    if (!repliedToMessage) return;

    const channelId = repliedToMessage.channelId;
    const conversation = Object.values(cacheStore.cache.conversations).find(
      (conv): conv is Conversation => {
        return (
          "messages" in conv &&
          Array.isArray(conv.messages) &&
          conv.messages.some(
            (msg) =>
              msg.messageId === repliedToMessage.id &&
              msg.channelId === channelId
          )
        );
      }
    );

    if (!conversation || !chatBot.modelName) return;

    const messageIndex = conversation.messages.findIndex(
      (msg) => msg.messageId === repliedToMessage.id
    );
    if (messageIndex === -1) return;

    const cachedContent = conversation.messages[messageIndex].data.content;
    const newThreadName = generateThreadName(
      repliedToMessage.content,
      cachedContent
    );

    // Create a clean version of conversation history without model information
    const conversationHistory = conversation.messages
      .slice(0, messageIndex + 1)
      .map((msg) => ({
        ...msg,
        data: {
          ...msg.data,
          modelName: chatBot.modelName || undefined, // Fix: use undefined instead of null
        },
      }));

    try {
      const newConversationId = createNewConversation();

      const parentChannel = message.channel;
      if (!parentChannel?.isTextBased() || !("guild" in parentChannel)) {
        return;
      }

      const channelToUseForThread = parentChannel.isThread()
        ? (parentChannel as ThreadChannel).parent
        : (parentChannel as TextChannel);

      if (!channelToUseForThread) return;

      // Use current model for both clients
      const client = ClientFactory.getClient(chatBot.modelName);
      const summaryClient = ClientFactory.getClient(chatBot.modelName);

      const apiMessages = conversationHistory.map((msg) => ({
        role: msg.data.isUserMessage ? "user" : "assistant",
        content: msg.data.content,
      }));

      const summaryStream = await summaryClient.generateResponse(
        "Please provide a concise, monotone summary of the conversation so far. Do not use bullet points or markdown.",
        null,
        undefined,
        apiMessages
      );

      let summary = "";
      for await (const chunk of summaryStream) {
        try {
          const data = JSON.parse(chunk.toString());
          if (data.response) summary += data.response;
        } catch (error) {
          console.error("Error parsing summary chunk:", error);
        }
      }

      const parentThreadName = parentChannel.isThread()
        ? (parentChannel as ThreadChannel).name
        : "original";

      const thread = await channelToUseForThread.threads.create({
        name: newThreadName,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        message: {
          content: `https://discord.com/channels/${message.guildId}/${repliedToMessage.channelId}/${repliedToMessage.id}\n\nStarting new conversation thread`,
        },
      });

      await thread.members.add(message.author.id);

      const threadInfo = `https://discord.com/channels/${message.guildId}/${repliedToMessage.channelId}/${repliedToMessage.id}\n\n${summary}`;

      const embedSummary = new EmbedBuilder().setDescription(threadInfo);
      const summaryMessage = await thread.send({ embeds: [embedSummary] });

      const cachedMessageData: CachedMessageData = {
        messageId: summaryMessage.id,
        channelId: thread.id,
        data: {
          content: summary,
          isUserMessage: false,
          modelName: chatBot.modelName, // Use current model
          pages: [summary],
          currentPageIndex: 0,
        },
        isSummary: true,
      };

      const newConversation = cacheStore.cache.conversations[newConversationId];
      if (newConversation) {
        newConversation.messages.push(cachedMessageData);
        newConversation.messages.push(...conversationHistory); // Using our cleaned history
      }

      updateState({
        currentConversationId: newConversationId,
        activeChannel: thread.id,
        restoredConversation: null,
        restoredInstructions: null,
      });

      setActiveChannel(thread);

      client.resetContext();
      client.setConversationHistory(apiMessages);
    } catch (error) {
      console.error("Error creating conversation thread:", error);
    }
  }
}

// Helper Functions
export function generateThreadName(
  message: string,
  cachedContent?: string
): string {
  try {
    const keywords = keyword_extractor.extract(message, {
      language: "english",
      remove_digits: true,
      return_changed_case: true,
      remove_duplicates: true,
    });

    let title = keywords.slice(0, 3).join("-").toLowerCase();
    return title || "new-thread";
  } catch (error) {
    console.error("Error generating thread name:", error);
    return "new-thread";
  }
}

export function buildHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("**vnc-lm Usage Instructions**")
    .setDescription(
      "This is a Discord bot for using local and hosted language models."
    )
    .addFields([
      {
        name: "Model Command",
        value:
          "`/model [model] [num_ctx] [system_prompt] [temperature] [remove]`",
      },
      {
        name: "Parameters",
        value: [
          "• `model`: (Required) Select the language model to use.",
          "• `num_ctx`: (Optional) Set the context window size. Only works with local models.",
          "• `system_prompt`: (Optional) Set a system prompt for the model.",
          "• `temperature`: (Optional) Set the temperature value (0-2) for response generation.",
          "• `remove`: (Optional) Remove a local model. Cannot be used with hosted models.",
        ].join("\n"),
      },
      {
        name: "Loading Models",
        value: [
          "• Use `/model` to load and configure models.",
          "• Download new local models by sending a model tag link:",
          "`https://ollama.com/library/[model]`",
          "`https://huggingface.co/[user]/[repo]/blob/main/[model].gguf`",
          "• Model downloading requires admin permissions in .env configuration.",
          "• Quick switch models during chat with `+ [model]`",
        ].join("\n"),
      },
      {
        name: "Interacting with the Bot",
        value: [
          "• Each `/model` command creates a new thread for conversation.",
          "• Messages over 1500 characters are automatically paginated with navigation.",
          "• Send `stop` to end message generation early.",
          "• Edit your messages to refine the model's response.",
          "• Reply to a message with `branch` to branch the conversation.",
        ].join("\n"),
      },
      {
        name: "Context Features",
        value: [
          "• Attach text files for additional context.",
          "• Share web links for automatic content extraction.",
          "• Send screenshots for text extraction via OCR.",
          "• Switch between different models while maintaining conversation context.",
          "• Conversations auto-thread for better organization.",
        ].join("\n"),
      },
      {
        name: "Important Notes",
        value: [
          "• Using `/model` creates a fresh thread with reset context.",
          "• The bot remembers your last used model and settings.",
          "• Conversations are cached and persist across restarts.",
          "• The bot supports markdown formatting in responses.",
          "• Thread names are generated from conversation content.",
        ].join("\n"),
      },
    ]);
}

export function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function extractModelTag(url: string): string | null {
  const ollamaMatch = url.match(/https:\/\/ollama\.com\/(.+)/);
  if (ollamaMatch) return ollamaMatch[1];

  const hfMatch = url.match(
    /https:\/\/huggingface\.co\/([^\/]+\/[^\/]+)\/blob\/main\/([^\/]+\.gguf)/
  );
  if (hfMatch) {
    const [, repoPath, fileName] = hfMatch;
    return `hf.co/${repoPath}:${fileName.replace(".gguf", "")}`;
  }

  return null;
}

export class CommandError extends Error {
  constructor(
    message: string,
    public readonly type:
      | "PERMISSION"
      | "VALIDATION"
      | "EXECUTION" = "EXECUTION"
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export const validators = {
  isValidTemperature: (temp?: number | null): boolean => {
    return temp === null || temp === undefined || (temp >= 0 && temp <= 2);
  },

  isValidContextSize: (size?: number | null): boolean => {
    return (
      size === null || size === undefined || (size >= 512 && size <= 32768)
    );
  },
};

export const modelManager = new ModelManager();

export const commands = {
  ModelCommand,
  HelpCommand,
  StopCommand,
  ThreadCommand,
};
