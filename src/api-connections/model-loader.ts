import axios from 'axios';
import { CacheType, CommandInteraction } from 'discord.js';

// Set the Ollama URL, defaulting to localhost if not provided in environment variables
const ollamaUrl = process.env.OLLAMAURL || 'http://localhost:11434';

export const loadModel = async (modelName: string, interaction: CommandInteraction<CacheType>): Promise<void> => {
  try {
    // Send an initial reply to the user indicating the model is loading
    await interaction.reply({ content: "The model is loading.", ephemeral: true });

    // Extract the base URL by removing '/api/generate' if present
    const baseUrl = ollamaUrl.replace('/api/generate', '');
    
    // Send a POST request to the Ollama API to load the model
    const response = await axios.post(`${baseUrl}/api/generate`, {
      model: modelName,
      prompt: ""  // Empty prompt to initiate model loading
    });

    // Check if the model has loaded successfully
    if (response.data && response.data.done === true) {
      // Send a follow-up message to the user confirming the model has loaded
      await interaction.followUp({ content: "The model has loaded.", ephemeral: true });
    } else {
      // Throw an error if the loading process didn't complete successfully
      throw new Error('Model loading did not complete successfully');
    }
  } catch (error) {
    // Log any errors that occur during the loading process
    console.error(`Error loading model:`, error);
    // Re-throw the error to be handled by the caller
    throw error;
  }
};