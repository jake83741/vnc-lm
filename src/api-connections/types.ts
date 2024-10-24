export interface ModelInfo {
  name: string;
}

export interface ModelDirectories {
  [key: string]: string;
}

export interface ModelOption {
  name: string;
  value: string;
}

export interface OllamaRequestOptions {
  model: string;
  prompt: string;
  system?: string | null;
  context?: string | null;
  temperature?: number;
  options?: {
    num_ctx?: number;
    keep_alive?: string;
  };
  images?: string[];
}

export interface OllamaResponse {
  response: string;
  context?: string;
  done: boolean;
}

export interface PullResponse {
  status: string;
  completed?: number;
  total?: number;
}

export interface ApiResponse {
  models: ModelInfo[];
}