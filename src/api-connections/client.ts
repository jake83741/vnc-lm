import axios, { CancelTokenSource } from 'axios';
import { Readable } from 'stream';
import { OllamaRequestOptions, ApiResponse } from './types';

export class OllamaClient {
  private url: string;
  private cancelTokenSource: CancelTokenSource;

  // ChatBot properties
  public modelName: string | null = null;
  public system: string | null = null;
  public temperature: number = 0.4;
  public numCtx: number = 2048;
  public keepAlive: string = '45m';
  public context: string | null = null;

  constructor(baseUrl: string = process.env.OLLAMAURL || 'http://localhost:11434') {
    this.url = baseUrl;
    this.cancelTokenSource = axios.CancelToken.source();
  }

  private getEndpoint(path: string): string {
    return `${this.url}/api/${path}`;
  }

  // Original OllamaClient methods
  public cancelRequest(reason: string): void {
    this.cancelTokenSource.cancel(reason);
    this.cancelTokenSource = axios.CancelToken.source();
  }

  public async generate(options: OllamaRequestOptions): Promise<Readable> {
    try {
      const response = await axios.post(
        this.getEndpoint('generate'),
        options,
        {
          cancelToken: this.cancelTokenSource.token,
          responseType: 'stream'
        }
      );
      return response.data;
    } catch (error: unknown) {
      if (axios.isCancel(error)) {
        throw error;
      }
      throw new Error(`Generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async listModels(): Promise<ApiResponse> {
    try {
      const response = await axios.get<ApiResponse>(this.getEndpoint('tags'));
      return response.data;
    } catch (error: unknown) {
      throw new Error(`Failed to list models: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async pullModel(modelTag: string): Promise<Readable> {
    try {
      const response = await axios.post(
        this.getEndpoint('pull'),
        { name: modelTag },
        { responseType: 'stream' }
      );
      return response.data;
    } catch (error: unknown) {
      throw new Error(`Failed to pull model: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async deleteModel(modelName: string): Promise<void> {
    try {
      await axios.delete(this.getEndpoint('delete'), {
        data: { name: modelName }
      });
    } catch (error: unknown) {
      throw new Error(`Failed to delete model: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async copyModel(source: string, destination: string): Promise<void> {
    try {
      await axios.post(this.getEndpoint('copy'), {
        source,
        destination
      });
    } catch (error: unknown) {
      throw new Error(`Failed to copy model: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ChatBot methods
  public getContext(): string | null {
    return this.context;
  }

  public resetContext(): void {
    this.context = null;
  }

  public setSystem(system: string | null = null): void {
    this.system = system;
  }

  public clearSystem(): void {
    this.system = null;
  }

  public setNumCtx(numCtx: number): void {
    this.numCtx = numCtx;
  }

  public setTemperature(temperature: number): void {
    this.temperature = temperature;
  }

  public setKeepAlive(keepAlive: string): void {
    this.keepAlive = keepAlive;
  }

  public async generateResponse(prompt: string, context: string | null = null, images: string[] = []): Promise<Readable> {
    if (!this.modelName) {
      throw new Error("No model is currently active. Please select a model using the /model command.");
    }

    return await this.generate({
      model: this.modelName,
      prompt,
      system: this.system,
      context,
      temperature: this.temperature,
      options: {
        num_ctx: this.numCtx,
        keep_alive: this.keepAlive
      },
      images: images.length > 0 ? images : undefined
    });
  }
}

export const defaultClient = new OllamaClient();
// Maintain backward compatibility with existing code
export const chatBot = defaultClient;