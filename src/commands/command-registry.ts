import {
  Client,
  ApplicationCommandDataResolvable,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  Interaction
} from 'discord.js';
import { handleModelCommand } from './model-command';
import { handleHelpCommand } from './help-command';
import { handleRejoinConversation } from './rejoin-conversation';

// Define interfaces for model directories and options
export interface ModelDirectories {
  [key: string]: string;
}

export interface ModelOption {
  name: string;
  value: string;
}

// Function to register slash commands with Discord
export async function registerCommands(client: Client, modelOptions: ModelOption[]) {
  const commands: ApplicationCommandDataResolvable[] = [
    {
      name: 'model',
      description: 'Load, configure, or remove a language model.',
      options: [
        {
          name: 'model',
          description: 'The model to switch to',
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: modelOptions
        },
        // Additional options for the model command
        {
          name: 'num_ctx',
          description: 'Set the context window size',
          type: ApplicationCommandOptionType.Integer,
        },
        {
          name: 'system_prompt',
          description: 'The system prompt for the model',
          type: ApplicationCommandOptionType.String,
        },
        {
          name: 'temperature',
          description: 'The temperature value for the model',
          type: ApplicationCommandOptionType.Number,
        },
        {
          name: 'remove',
          description: 'Remove the specified model',
          type: ApplicationCommandOptionType.Boolean,
        },
      ]
    },
    {
      name: 'help',
      description: 'Get instructions on how to use the bot',
    }, 
    {
      name: 'Rejoin Conversation',
      type: ApplicationCommandType.Message,
    }
  ];

  try {
    console.log('Started refreshing application (/) commands.');
    // Set the commands for the Discord application
    await client.application?.commands.set(commands);
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error refreshing application (/) commands:', error);
  }
}

// Function to handle incoming interactions (commands)
export const handleCommands = async (interaction: Interaction, modelDirectories: ModelDirectories) => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    switch (commandName) {
      case 'model':
        // Handle the model command
        await handleModelCommand(interaction, modelDirectories);
        break;
      case 'help':
        // Handle the help command
        await handleHelpCommand(interaction);
        break;
      default:
        console.log(`Unknown command: ${commandName}`);
    }
  } else if (interaction.isContextMenuCommand() && interaction.commandName === 'Rejoin Conversation') {
    // Handle the Rejoin Conversation context menu command
    await handleRejoinConversation(interaction);
  } else {
    console.log('Unhandled interaction type');
  }
};
