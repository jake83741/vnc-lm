import { CommandInteraction, CacheType, EmbedBuilder } from 'discord.js';

export const handleHelpCommand = async (interaction: CommandInteraction<CacheType>) => {
  const helpEmbed = new EmbedBuilder()
    .setTitle('**vnc-lm Usage Instructions**')
    .setDescription('This is a Discord bot for using local and hosted language models. Here\'s how to use it:')
    .addFields(
      { name: 'Model Command', value: '`/model [model] [num_ctx] [system_prompt] [temperature] [remove]`' },
      { name: 'Parameters', value: 
        '• `model`: (Required) Select the language model to use.\n' +
        '• `num_ctx`: (Optional) Set the context window size. Only works with local models.\n' +
        '• `system_prompt`: (Optional) Set a system prompt for the model.\n' +
        '• `temperature`: (Optional) Set the temperature value (0-2) for response generation.\n' +
        '• `remove`: (Optional) Remove a local model. Cannot be used with hosted models.\n'
      },
      { name: 'Loading Models', value:
        '• Use `/model` to load and configure models.\n' +
        '• Download new local models by sending a model tag link:\n' +
        '`https://ollama.com/library/[model]`\n' +
        '`https://huggingface.co/[user]/[repo]/blob/main/[model].gguf`\n' +
        '• Model downloading requires admin permissions in .env configuration.\n' +
        '• Quick switch models during chat with `+ [model]`'
      },
      { name: 'Interacting with the Bot', value: 
        '• Each `/model` command creates a new thread for conversation.\n' +
        '• Messages over 1500 characters are automatically paginated with navigation.\n' +
        '• Send `stop` to end message generation early.\n' +
        '• Edit your messages to refine the model\'s response.\n' +
        '• Reply to a message with `pull` to branch the conversation.'
      },
      { name: 'Context Features', value:
        '• Attach text files for additional context.\n' +
        '• Share web links for automatic content extraction.\n' +
        '• Send screenshots for text extraction via OCR.\n' +
        '• Switch between different models while maintaining conversation context.\n' +
        '• Conversations auto-thread for better organization.'
      },
      { name: 'Important Notes', value: 
        '• Using `/model` creates a fresh thread with reset context.\n' +
        '• The bot remembers your last used model and settings.\n' +
        '• Conversations are cached and persist across restarts.\n' +
        '• The bot supports markdown formatting in responses.\n' +
        '• Thread names are generated from conversation content.'
      }
    );
  
  await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
};
