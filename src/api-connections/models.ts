import { Readable } from 'stream';
import { OllamaClient } from './client';
import { ModelDirectories, ModelOption } from './types';
import { CacheType, CommandInteraction, EmbedBuilder, Message } from 'discord.js';
import { adminUserId } from '../utilities';
import { refreshModelLibrary } from '../bot';

export class ModelManager {
  private client: OllamaClient;

  constructor(baseUrl?: string) {
    this.client = new OllamaClient(baseUrl);
  }

  public async loadModelDirectories(): Promise<ModelDirectories> {
    try {
      const response = await this.client.listModels();
      const modelDirectories: ModelDirectories = {};
      response.models.forEach(model => {
        modelDirectories[model.name] = model.name;
      });
      return modelDirectories;
    } catch (error) {
      console.error('Error loading model directories:', error);
      return {};
    }
  }

  public async loadModel(modelName: string, interaction: CommandInteraction<CacheType>): Promise<void> {
    try {
      // Send initial loading message
      await interaction.reply({ content: "The model is loading.", ephemeral: true });
  
      // Load the model
      await this.client.generate({
        model: modelName,
        prompt: "",  // Empty prompt to initiate model loading
        temperature: 0,
        options: {
          num_ctx: 2048,
        }
      });
  
      // Send completion message
      await interaction.followUp({ content: "The model has loaded.", ephemeral: true });
    } catch (error) {
      throw new Error(`Failed to load model: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async handleModelPull(message: Message, modelTag: string): Promise<void> {
    if (!adminUserId || message.author.id !== adminUserId) {
        await message.reply(adminUserId ? 'You do not have permission to pull models.' : 'Admin user ID is not set. Model pulling is disabled.');
        return;
    }

    const displayModelName = modelTag.split(':').pop() || modelTag;
    const embed = new EmbedBuilder().setFooter({ text: `pulling ${displayModelName}` });
    const reply = await message.reply({ embeds: [embed] });

    try {
        const stream = await this.pullModel(modelTag);
        let statusHistory: string[] = [];
        let lastStatusLine = ''; // Add this to track the last status

        for await (const chunk of stream) {
            const jsonObjects = chunk.toString().split('\n').filter((str: string) => str.trim());

            for (const jsonStr of jsonObjects) {
                try {
                    const status = JSON.parse(jsonStr);
                    let statusLine = status.status;

                    // Always update for downloading status to show progress
                    if (status.status === 'downloading' && typeof status.completed === 'number' && typeof status.total === 'number') {
                        const progress = (status.completed / status.total * 100).toFixed(2);
                        statusLine = `downloading (${progress}%)`;
                    }

                    // Only add status if it's different from the last one
                    if (statusLine !== lastStatusLine) {
                        statusHistory.push(statusLine);
                        statusHistory = statusHistory.slice(-10); // Keep last 10 entries
                        lastStatusLine = statusLine;

                        // Update embed only when there's a new status
                        this.updateEmbed(embed, statusHistory, displayModelName);
                        await reply.edit({ embeds: [embed] });
                    }

                    if (status.status === 'success') {
                        if (modelTag.startsWith('hf.co/')) {
                            const newModelName = modelTag.split(':').pop() || modelTag;
                            await this.copyModel(modelTag, newModelName);
                            await this.deleteModel(modelTag);
                        }
                        
                        this.updateEmbed(embed, statusHistory, displayModelName, true);
                        await reply.edit({ embeds: [embed] });
                        await refreshModelLibrary();
                        break;
                    }
                } catch (parseError) {
                    console.error('Error parsing JSON:', parseError);
                }
            }
        }
    } catch (error) {
        console.error('Error pulling model:', error);
        this.updateEmbed(embed, ['An error occurred while pulling the model.'], displayModelName, false, true);
        await reply.edit({ embeds: [embed] });
    }
}

  public getModelOptions(modelDirectories: ModelDirectories): ModelOption[] {
    return Object.keys(modelDirectories).map(modelName => ({
      name: modelName,
      value: modelName
    }));
  }

  public async pullModel(modelTag: string): Promise<Readable> {
    return await this.client.pullModel(modelTag);
  }

  public async deleteModel(modelName: string): Promise<void> {
    await this.client.deleteModel(modelName);
  }

  public async copyModel(source: string, destination: string): Promise<void> {
    await this.client.copyModel(source, destination);
  }

  public extractModelTag(url: string): string | null {
    const ollamaMatch = url.match(/https:\/\/ollama\.com\/(.+)/);
    if (ollamaMatch) return ollamaMatch[1];

    const hfMatch = url.match(/https:\/\/huggingface\.co\/([^\/]+\/[^\/]+)\/blob\/main\/([^\/]+\.gguf)/);
    if (hfMatch) {
      const [, repoPath, fileName] = hfMatch;
      return `hf.co/${repoPath}:${fileName.replace('.gguf', '')}`;
    }

    return null;
  }

  private updateEmbed(embed: EmbedBuilder, statusHistory: string[], modelName: string, success = false, error = false) {
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
}