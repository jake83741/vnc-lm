import { Client, ApplicationCommandDataResolvable, ApplicationCommandOptionType, Interaction } from 'discord.js';
import { handleModelCommand } from './model-command';
import { handleHelpCommand } from './help-command';

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
    }
  ];

  try {
    console.log('Started refreshing application (/) commands.');
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
        await handleModelCommand(interaction, modelDirectories);
        break;
      case 'help':
        await handleHelpCommand(interaction);
        break;
      default:
        console.log(`Unknown command: ${commandName}`);
    }
  } else {
    console.log('Unhandled interaction type');
  }
};