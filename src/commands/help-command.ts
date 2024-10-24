import { CommandInteraction, CacheType, EmbedBuilder } from 'discord.js';

// Function to handle the '/help' command
export const handleHelpCommand = async (interaction: CommandInteraction<CacheType>) => {
  // Create a new EmbedBuilder to construct the help message
  const helpEmbed = new EmbedBuilder()
    .setTitle('Bot Usage Instructions')
    .setDescription('This is a Discord bot for using language models. Here\'s how to use it:')
    .addFields(
      // Explain the '/model' command syntax
      { name: 'Model Command', value: '`/model [model] [num_ctx] [system_prompt] [temperature] [remove]`' },
      // Describe each parameter of the '/model' command
      { name: 'Parameters', value: 
        '• `model`: (Required) Select the language model to use.\n' +
        '• `num_ctx`: (Optional) Set the context window size.\n' +
        '• `system_prompt`: (Optional) Set a system prompt for the model.\n' +
        '• `temperature`: (Optional) Set the temperature value for response generation.\n' +
        '• `remove`: (Optional) Remove the specified model.\n'
      },
      // Explain how to interact with the bot
      { name: 'Interacting with the Bot', value: 
        'After loading a model, you can interact with the bot by:\n' +
        '• Sending messages in the active channel. Pinging the bot is not required.\n' +
        '• Replying to the bot\'s messages.\n' +
        '• Reply to old messages to discuss them with the bot.\n' +
        '• Rejoin a conversation by clicking rejoin conversation in context menu.\n' +
        '• Send `stop` to end a message early.'
      },
      // Provide important notes about bot behavior
      { name: 'Important Notes', value: 
        '• Using the `/model` command stops ongoing generation and resets the conversation context.\n' +
        '• The bot remembers your last used model, system prompt, and temperature settings.\n' +
        '• The bot supports markdown formatting in its responses.\n' +
        '• Use `/help` anytime to see this message again.'
      }
    );
  
  // Send the help embed as a reply to the interaction
  // 'ephemeral: false' means the message will be visible to everyone in the channel
  await interaction.reply({ embeds: [helpEmbed], ephemeral: false });
};
