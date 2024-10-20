import axios, { AxiosResponse, CancelTokenSource } from 'axios';
import { defaultNumCtx, defaultTemperature, defaultKeepAlive } from '../utils';
import { Readable } from 'stream';

// Default URL for Ollama API, can be overridden by environment variable
const defaultOllamaUrl = process.env.OLLAMAURL || 'http://localhost:11434';

export class Ollama {
  private url: string;
  private currentRequest: Promise<AxiosResponse<any>> | null = null;
  private cancelTokenSource: CancelTokenSource = axios.CancelToken.source();

  constructor(
    private ollamaUrl: string = defaultOllamaUrl,
    public modelName: string | null = null,
    public system: string | null = null,
    public temperature: number = defaultTemperature,
    public numCtx: number = defaultNumCtx,
    public keepAlive: string = defaultKeepAlive,
    public context: string | null = null
  ) {
    this.url = `${ollamaUrl}/api/generate`;
  }

  // Getter for context
  getContext = (): string | null => this.context;

  // Reset context and cancel any ongoing request
  resetContext = (): void => {
    this.context = null;
    this.cancelAndResetToken('Context reset');
  }

  // Set system prompt
  setSystem = (system: string | null = null): void => {
    this.system = system;
  }

  // Clear system prompt and cancel any ongoing request
  clearSystem = (): void => {
    this.system = null;
    this.cancelAndResetToken('System cleared');
  }

  // Setters for various parameters
  setNumCtx = (numCtx: number): void => { this.numCtx = numCtx; }
  setTemperature = (temperature: number): void => { this.temperature = temperature; }
  setKeepAlive = (keepAlive: string): void => { this.keepAlive = keepAlive; }

  // Cancel current request and create a new cancel token
  private cancelAndResetToken = (reason: string): void => {
    this.cancelTokenSource.cancel(reason);
    this.cancelTokenSource = axios.CancelToken.source();
  }

  // Public method to cancel ongoing request
  public cancelRequest = (reason: string): void => {
    this.cancelAndResetToken(reason);
  }

  async generateResponse(prompt: string, context: string | null = null, images: string[] = []): Promise<any> {
    // Check if a model is selected
    if (!this.modelName) return "No model is currently active. Please select a model using the /model command.";

    // Prepare request payload
    const ollamaRequest: any = {
      model: this.modelName,
      prompt,
      system: this.system,
      context,
      temperature: this.temperature,
      options: {
        num_ctx: this.numCtx,
        keep_alive: this.keepAlive
      }
    };

    // Add images to request if provided
    if (images.length > 0) {
      ollamaRequest.images = images;
    }

    try {
      // Send POST request to Ollama API
      this.currentRequest = axios.post(this.url, ollamaRequest, {
        cancelToken: this.cancelTokenSource.token,
        responseType: 'stream',
      });

      const ollamaResponse = await this.currentRequest;
      this.currentRequest = null;

      // Check response status
      if (ollamaResponse.status === 200) {
        return ollamaResponse.data;
      } else {
        console.error(`API request failed with status ${ollamaResponse.status}`);
        return `Error: API request failed with status ${ollamaResponse.status}`;
      }
    } catch (error) {
      this.currentRequest = null;
      if (axios.isCancel(error)) {
        // Request was cancelled
        return null;
      } else {
        console.error('Unexpected error occurred:', error);
        return "Error: Unexpected error occurred.";
      }
    }
  }
}

// Create a default instance of Ollama
export const chatBot = new Ollama();

// Function to pull an Ollama model
export async function pullOllamaModel(modelTag: string): Promise<Readable> {
  const url = `${defaultOllamaUrl}/api/pull`;
  const response = await axios.post(url, { name: modelTag }, { responseType: 'stream' });
  return response.data;
}