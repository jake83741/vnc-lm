import { BaseClient } from './base-client';
import { OllamaClient } from './provider/ollama/client';
import { LiteLLMClient } from './provider/litellm/client';
import axios from 'axios';

export class ClientFactory {
    private static ollamaClient: OllamaClient;
    private static litellmClient: LiteLLMClient;
    private static ollamaModels = new Set<string>();

    public static async initializeOllamaModels(): Promise<void> {
        try {
            const response = await axios.get('http://host.docker.internal:11434/api/tags');
            if (response.data && response.data.models) {
                this.ollamaModels = new Set(
                    response.data.models.map((model: { name: string }) => model.name)
                );
            }
        } catch (error) {
        }
    }

    public static getClient(modelName: string): BaseClient {
        if (this.ollamaModels.has(modelName)) {
            if (!this.ollamaClient) {
                this.ollamaClient = new OllamaClient();
            }
            this.ollamaClient.modelName = modelName;
            return this.ollamaClient;
        }

        if (!this.litellmClient) {
            this.litellmClient = new LiteLLMClient();
        }
        this.litellmClient.modelName = modelName;
        return this.litellmClient;
    }

    public static clearCache(): void {
        this.ollamaClient = undefined as any;
        this.litellmClient = undefined as any;
        this.ollamaModels.clear();
    }
}