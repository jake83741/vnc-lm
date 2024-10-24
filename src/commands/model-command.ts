import { CommandInteraction, CacheType, InteractionReplyOptions } from 'discord.js';
import { updateState, setActiveChannel, createNewConversation } from '../managers/cache';
import { defaultModelManager } from '../api-connections';
import { chatBot } from '../utilities';
import { handleRemoveModel } from './optional-params/remove';

// Define an interface for model directories
interface ModelDirectories {
  [key: string]: string;
}

export const handleModelCommand = async (interaction: CommandInteraction<CacheType>, modelDirectories: ModelDirectories) => {
  // Reset the conversation and instructions
  updateState({
    restoredConversation: null,
    restoredInstructions: null
  });

  // Extract command options
  const modelName = interaction.options.get('model')?.value as string;
  const numCtx = interaction.options.get('num_ctx')?.value as number | null;
  const systemPrompt = interaction.options.get('system_prompt')?.value as string | null;
  const temperature = interaction.options.get('temperature')?.value as number | null;
  const remove = interaction.options.get('remove')?.value as boolean;

  // Handle model removal if the 'remove' option is set
  if (remove) {
    await handleRemoveModel(interaction, modelName);
    return;
  }

  // Check if the specified model exists in the model directories
  if (modelName in modelDirectories) {
    // Create a new conversation
    const newConversationId = createNewConversation();

    // Reset and configure the chatbot
    chatBot.resetContext();
    chatBot.setNumCtx(numCtx !== null ? numCtx : Number(process.env.NUM_CTX) || 2048);
    chatBot.modelName = modelName;
    if (interaction.client.user) {
      interaction.client.user.setActivity(`${modelName}`);
    }
    chatBot.clearSystem();
    chatBot.setTemperature(temperature !== null ? temperature : Number(process.env.TEMPERATURE) || 0.4);
    if (systemPrompt) {
      chatBot.setSystem(systemPrompt);
    }
    
    // Update the state with new configuration
    updateState({
      lastUsedModel: modelName,
      lastSystemPrompt: systemPrompt,
      lastTemperature: temperature !== null ? temperature : Number(process.env.TEMPERATURE) || 0.4,
      lastNumCtx: numCtx !== null ? numCtx : Number(process.env.NUM_CTX) || 2048,
      currentConversationId: newConversationId
    });

    try {
      await defaultModelManager.loadModel(modelName, interaction);
    } catch (error) {
      console.error(`Error loading model:`, error);
      const errorReply: InteractionReplyOptions = {
        content: `There was an issue loading the model ${modelName}.`,
        ephemeral: true,
      };
      await interaction.followUp(errorReply);
    }

    // Set the interaction channel as the active channel
    setActiveChannel(interaction.channel);
  } else {
    // Respond if the specified model is not found
    await interaction.reply({ content: `The model ${modelName} was not found in the model directory.`, ephemeral: true });
  }
};
