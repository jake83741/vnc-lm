import { Readable } from 'stream';
import { ModelDirectories, ModelOption } from '../utilities/types';
import { EmbedBuilder, Message, CommandInteraction, CacheType } from 'discord.js';
import { adminUserId } from '../utilities';
import { refreshModelLibrary } from '../bot';
import { OllamaClient } from '../api-connections/provider/ollama/client';
import { LiteLLMClient } from '../api-connections/provider/litellm/client';
import axios, { AxiosError } from 'axios';

interface ExtendedModelDirectories extends ModelDirectories {
    [key: string]: string & { source?: 'ollama' | 'litellm' };
}

export class ModelManager {
    private ollamaClient: OllamaClient;
    private liteLLMClient: LiteLLMClient;
    private liteLLMUrl: string;
    private static hasInitialized = false;
    private maxRetries = 5;
    private retryDelay = 2000;
    public modelSources: Map<string, 'ollama' | 'litellm'> = new Map();

    constructor(baseUrl?: string, liteLLMUrl: string = 'http://litellm:4000') {
        this.ollamaClient = new OllamaClient(baseUrl);
        this.liteLLMClient = new LiteLLMClient(liteLLMUrl);
        this.liteLLMUrl = liteLLMUrl;
    }

    // ... [keep all existing methods as they are]
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
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }
        return false;
    }

    public async loadModelDirectories(): Promise<ExtendedModelDirectories> {
        const modelDirectories: ExtendedModelDirectories = {};
    
        // Try LiteLLM models but don't block on failure
        try {
            if (!ModelManager.hasInitialized) {
                await this.waitForLiteLLM();
            }
    
            const response = await axios.get(`${this.liteLLMUrl}/v1/models`, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });
    
            if (response.data && response.data.data) {
                // Sort models alphabetically before adding
                const sortedModels = response.data.data
                    .map((model: { id: string }) => model.id)
                    .sort((a: string, b: string) => a.localeCompare(b));
    
                sortedModels.forEach((modelName: string) => {
                    modelDirectories[modelName] = modelName;
                    this.modelSources.set(modelName, 'litellm');
                });
            }
        } catch (error) {
        }
    
        // Load Ollama models independently
        try {
            const ollamaResponse = await axios.get('http://host.docker.internal:11434/api/tags', {
                timeout: 5000
            });
    
            if (ollamaResponse.data && ollamaResponse.data.models) {
                // Sort models alphabetically before adding
                const sortedModels = ollamaResponse.data.models
                    .map((model: { name: string }) => model.name)
                    .sort((a: string, b: string) => a.localeCompare(b));
    
                sortedModels.forEach((modelName: string) => {
                    modelDirectories[modelName] = modelName;
                    this.modelSources.set(modelName, 'ollama');
                });
            }
        } catch (error) {
        }
    
        // Return alphabetically sorted combined directory
        return Object.keys(modelDirectories)
            .sort((a, b) => a.localeCompare(b))
            .reduce((sorted: ExtendedModelDirectories, key: string) => {
                sorted[key] = modelDirectories[key];
                return sorted;
            }, {});
    }

    public async loadModel(modelName: string): Promise<void> {
        try {
            // Check if it's an Ollama model
            if (this.modelSources.get(modelName) === 'ollama') {
                await this.ollamaClient.generate({
                    model: modelName,
                    prompt: "",
                    temperature: 0,
                    options: { num_ctx: 2048 }
                });
                return;
            }
    
            // For LiteLLM models, just verify it exists in the available models
            const modelsResponse = await axios.get(`${this.liteLLMUrl}/v1/models`);
            const availableModels = modelsResponse.data?.data?.map((model: any) => model.id) || [];
            
            if (!availableModels.includes(modelName)) {
                throw new Error(`Model ${modelName} not found in LiteLLM proxy`);
            }
            // No need to test hosted models - they're always available
        } catch (error) {
            // Handle error formatting as before
            if (axios.isAxiosError(error)) {
                const errorData = error.response?.data;
                if (error.response?.status === 429) {
                    const waitTime = errorData?.error?.details?.match(/wait (\d+) seconds/)?.[1] || 'unknown';
                    throw new Error(`Rate limit exceeded for model ${modelName}. Please wait ${waitTime} seconds before retrying.`);
                }
                const errorMessage = errorData?.error?.message || errorData?.message || error.message;
                throw new Error(`LiteLLM error: ${errorMessage}`);
            }
            throw error instanceof Error ? error : new Error(`Failed to load model: ${String(error)}`);
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
            let lastStatusLine = '';

            for await (const chunk of stream) {
                const jsonObjects = chunk.toString().split('\n').filter((str: string) => str.trim());

                for (const jsonStr of jsonObjects) {
                    try {
                        const status = JSON.parse(jsonStr);
                        let statusLine = status.status;

                        if (status.status === 'downloading' && typeof status.completed === 'number' && typeof status.total === 'number') {
                            const progress = (status.completed / status.total * 100).toFixed(2);
                            statusLine = `downloading (${progress}%)`;
                        }

                        if (statusLine !== lastStatusLine) {
                            statusHistory.push(statusLine);
                            statusHistory = statusHistory.slice(-10);
                            lastStatusLine = statusLine;

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
                            return; // Return after successful model pull
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

    private async pullModel(modelTag: string): Promise<Readable> {
        if (modelTag.includes('ollama.com') || !modelTag.includes('litellm')) {
            return await this.ollamaClient.pullModel(modelTag);
        } else {
            throw new Error('LiteLLM model pulling is not supported.');
        }
    }
    
    public async deleteModel(modelName: string): Promise<void> {
        // Remove check for modelSources since we know this is a temporary tag we want to delete
        if (modelName.startsWith('litellm')) {
            throw new Error('Only local Ollama models can be deleted');
        }
    
        await this.ollamaClient.deleteModel(modelName);
    }
    
    public async copyModel(source: string, destination: string): Promise<void> {
        // Remove the ollama- prefix check since we're handling both Ollama and HF models
        if (!source.includes('litellm')) {
            await this.ollamaClient.copyModel(source, destination);
        } else {
            // LiteLLM models are not copyable, so we can ignore this request
        }
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

export interface BaseModelManager {
    loadModelDirectories(): Promise<ModelDirectories>;
    loadModel(modelName: string, interaction: CommandInteraction<CacheType>): Promise<void>;
    handleModelPull(message: Message, modelTag: string): Promise<void>;
    getModelOptions(modelDirectories: ModelDirectories): ModelOption[];
    pullModel(modelTag: string): Promise<Readable>;
    deleteModel(modelName: string): Promise<void>;
    copyModel(source: string, destination: string): Promise<void>;
}
