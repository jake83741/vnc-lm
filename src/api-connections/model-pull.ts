import { Message, EmbedBuilder, TextChannel, DMChannel, NewsChannel, ThreadChannel, ChannelType } from 'discord.js';
import { pullOllamaModel } from './api-requests';
import { refreshModelLibrary } from '../bot';
import { adminUserId } from '../utils';
import axios from 'axios';

const ollamaUrl = process.env.OLLAMAURL || 'http://localhost:11434';

export async function handleModelPull(message: Message, modelTag: string) {
  if (!adminUserId || message.author.id !== adminUserId) {
    await message.reply(adminUserId ? 'You do not have permission to pull models.' : 'Admin user ID is not set. Model pulling is disabled.');
    return;
  }

  let displayModelName = modelTag.split(':').pop() || modelTag;

  const embed = new EmbedBuilder().setFooter({ text: `pulling ${displayModelName}` });
  const reply = await message.reply({ embeds: [embed] });

  try {
    const stream = await pullOllamaModel(modelTag);
    let statusHistory: string[] = [];
    let lastStatus = '';
    let lastProgress = '';

    for await (const chunk of stream) {
      const jsonObjects = chunk.toString().split('\n').filter((str: string) => str.trim());

      for (const jsonStr of jsonObjects) {
        try {
          const status = JSON.parse(jsonStr);
          if (status.status && status.status !== lastStatus) {
            lastStatus = status.status;
            let statusLine = status.status;

            if (status.status === 'downloading' && status.completed && status.total) {
              const progressStr = `(${(status.completed / status.total * 100).toFixed(2)}%)`;
              if (progressStr !== lastProgress) {
                lastProgress = progressStr;
                statusLine += ` ${progressStr}`;
              } else {
                continue;
              }
            }

            statusHistory.push(statusLine);
            statusHistory = statusHistory.slice(-10);

            updateEmbed(embed, statusHistory, displayModelName);
            await reply.edit({ embeds: [embed] });

            if (status.status === 'success') {
              if (modelTag.startsWith('hf.co/')) {
                const newModelName = getNewModelName(modelTag);
                await copyAndRenameModel(modelTag, newModelName);
                await deleteOriginalModel(modelTag);
                displayModelName = newModelName;
              }
            
              updateEmbed(embed, statusHistory, displayModelName, true);
              await reply.edit({ embeds: [embed] });
              await refreshModelLibrary();
              break;
            }
          }
        } catch (parseError) {
          console.error('Error parsing JSON:', parseError);
        }
      }
    }
  } catch (error) {
    console.error('Error pulling model:', error);
    updateEmbed(embed, ['An error occurred while pulling the model.'], displayModelName, false, true);
    await reply.edit({ embeds: [embed] });
    await sendMessageSafely(message.channel, "Failed to update the model library. Please try again later.");
  }
}

function updateEmbed(embed: EmbedBuilder, statusHistory: string[], modelName: string, success = false, error = false) {
  const description = "```console\n" + statusHistory.join('\n') + "\n```";
  embed.setDescription(description);
  
  if (success) {
    embed.setFooter({ text: `${modelName} pulled successfully` });
  } else if (error) {
    embed.setFooter({ text: `Failed to pull ${modelName}` });
  } else {
    const spinnerEmojis = ['+', 'x', '*'];
    const emojiIndex = Math.floor(Date.now() / 500) % spinnerEmojis.length;
    embed.setFooter({ text: `pulling ${modelName} ${spinnerEmojis[emojiIndex]}` });
  }
}

async function sendMessageSafely(channel: Message['channel'], content: string) {
  if ([ChannelType.DM, ChannelType.GuildText, ChannelType.GuildNews, ChannelType.PublicThread, ChannelType.PrivateThread].includes(channel.type)) {
    try {
      await (channel as TextChannel | DMChannel | NewsChannel | ThreadChannel).send(content);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  } else {
    console.error('Channel is not a type that can send messages');
  }
}

function getNewModelName(modelTag: string): string {
  const parts = modelTag.split(':');
  return parts[parts.length - 1];
}

async function copyAndRenameModel(originalName: string, newName: string) {
  try {
    await axios.post(`${ollamaUrl}/api/copy`, {
      source: originalName,
      destination: newName
    });
  } catch (error) {
    console.error('Error copying and renaming model:', error);
    throw error;
  }
}

async function deleteOriginalModel(modelName: string) {
  try {
    await axios.delete(`${ollamaUrl}/api/delete`, {
      data: { name: modelName }
    });
  } catch (error) {
    console.error('Error deleting original model:', error);
    throw error;
  }
}