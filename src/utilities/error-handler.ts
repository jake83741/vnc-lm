import {
  EmbedBuilder,
  TextChannel,
  ThreadChannel,
  DMChannel,
  NewsChannel,
  Channel,
  BaseGuildTextChannel,
  Client,
} from "discord.js";
import { getActiveChannel } from "../utilities";

type TextBasedChannel =
  | TextChannel
  | ThreadChannel
  | DMChannel
  | NewsChannel
  | BaseGuildTextChannel;

function isTextBasedChannel(channel: any): channel is TextBasedChannel {
  return channel !== null && typeof channel?.send === "function";
}

const recentErrors = new Map<string, number>();
const ERROR_DEDUPE_WINDOW = 1000; // 1 second

let globalErrorCount = 0;
const MAX_GLOBAL_ERRORS = 10;
const ERROR_RESET_INTERVAL = 60000; // 1 minute

let clientInstance: Client | null = null;

export function setClientInstance(client: Client) {
  clientInstance = client;
}

setInterval(() => {
  globalErrorCount = 0;
}, ERROR_RESET_INTERVAL);

export const handleGlobalError = async (error: any) => {
  globalErrorCount++;
  console.log(`Error count: ${globalErrorCount}/${MAX_GLOBAL_ERRORS}`);

  if (globalErrorCount > MAX_GLOBAL_ERRORS) {
    console.error('Too many errors, shutting down bot');
    if (clientInstance) {
      await clientInstance.destroy();
    }
    process.exit(1);
  }

  const activeChannel = getActiveChannel();
  if (!activeChannel || !isTextBasedChannel(activeChannel)) return;

  let statusCode = "Unknown";
  let errorMessage = "An unknown error occurred";

  // Extract error information
  if (error.response) {
    statusCode = error.response.status;
    errorMessage =
      error.response.data?.error?.message ||
      error.response.data?.message ||
      error.message;
  } else if (error.code) {
    statusCode = error.code;
    errorMessage = error.message;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  // Deduplication check
  const errorKey = `${errorMessage}-${activeChannel.id}`;
  const now = Date.now();
  const lastSeen = recentErrors.get(errorKey);

  if (lastSeen && now - lastSeen < ERROR_DEDUPE_WINDOW) {
    return;
  }

  recentErrors.set(errorKey, now);
  setTimeout(() => recentErrors.delete(errorKey), ERROR_DEDUPE_WINDOW);

  // Create error embed
  const errorEmbed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle(`Error ${statusCode}`)
    .setDescription(`\`\`\`\n${errorMessage}\n\`\`\``)
    .setTimestamp();

  try {
    await activeChannel.send({ embeds: [errorEmbed] });
  } catch (err) {
    console.error("Failed to send error message:", err);
  }
};

// Export for use in other files that need to check error count
export function getErrorCount() {
  return globalErrorCount;
}