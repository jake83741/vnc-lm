import axios from 'axios';

// Define interface for model directories
export interface ModelDirectories {
  [key: string]: string;
}

// Define interface for individual model information
interface ModelInfo {
  name: string;
}

// Define interface for API response structure
interface ApiResponse {
  models: ModelInfo[];
}

// Set Ollama URL, default to localhost if not provided in environment variables
const ollamaUrl = process.env.OLLAMAURL || 'http://localhost:11434';

// Function to load model directories from Ollama API
export async function loadModelDirectories(): Promise<ModelDirectories> {
  const modelDirectories: ModelDirectories = {};

  try {
    // Make GET request to Ollama API to fetch available models
    const response = await axios.get<ApiResponse>(`${ollamaUrl.replace('/api/generate', '')}/api/tags`);
    const models = response.data.models;

    // Populate modelDirectories object with model names
    models.forEach(model => {
      modelDirectories[model.name] = model.name;
    });

  } catch (error) {
    // Log any errors that occur during API request
    console.error('Error loading model directories:', error);
  }

  // Return the populated modelDirectories object
  return modelDirectories;
}

// Function to convert modelDirectories object into an array of options
export function getModelOptions(modelDirectories: ModelDirectories) {
  // Map each model name to an object with name and value properties
  return Object.keys(modelDirectories).map(modelName => ({ name: modelName, value: modelName }));
}