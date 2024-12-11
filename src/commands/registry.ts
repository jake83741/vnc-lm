import { Client, ApplicationCommandDataResolvable, ApplicationCommandOptionType, Interaction, Message } from 'discord.js';
import { BaseCommand, CommandContext } from './base';
import { commands } from './handlers';
import { ModelManager } from './handlers';
import { ModelDirectories } from '../utilities/index';

export class CommandRegistry {
    private commands: Map<string, BaseCommand> = new Map();
    private client: Client;
    private modelManager: ModelManager;
    private modelDirectories: ModelDirectories = {};

    constructor(client: Client, modelManager: ModelManager) {
        this.client = client;
        this.modelManager = modelManager;
        this.initializeCommands();
    }

    private initializeCommands() {
        this.commands.set('model', new commands.ModelCommand(this.modelManager));
        this.commands.set('help', new commands.HelpCommand());
        this.commands.set('stop', new commands.StopCommand());
        this.commands.set('thread', new commands.ThreadCommand());
    }

    public getCommand(name: string): BaseCommand | undefined {
        return this.commands.get(name);
    }

    public updateModelDirectories(directories: ModelDirectories) {
        this.modelDirectories = directories;
    }

    private getModelChoices() {
        return Object.keys(this.modelDirectories)
            .sort()
            .map(name => ({
                name,
                value: name
            }));
    }

    public async registerSlashCommands() {
        // Get fresh model choices before registering commands
        const modelDirectories = await this.modelManager.loadModelDirectories();
        this.updateModelDirectories(modelDirectories);

        const commandData: ApplicationCommandDataResolvable[] = [
            {
                name: 'model',
                description: 'Load, configure, or remove a language model.',
                options: [
                    {
                        name: 'model',
                        description: 'The model to switch to',
                        type: ApplicationCommandOptionType.String,
                        required: true,
                        choices: this.getModelChoices()
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
            await this.client.application?.commands.set(commandData);
            console.log('Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error('Error refreshing application (/) commands:', error);
        }
    }

    public async handleInteraction(interaction: Interaction) {
        if (!interaction.isChatInputCommand()) return;

        const command = this.commands.get(interaction.commandName);
        if (!command) return;

        const context: CommandContext = {
            interaction,
            isThread: interaction.channel?.isThread() || false
        };

        try {
            await command.execute(context);
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'There was an error executing this command.', 
                    ephemeral: true 
                });
            } else {
                await interaction.followUp({ 
                    content: 'There was an error executing this command.', 
                    ephemeral: true 
                });
            }
        }
    }

    public async handleMessage(message: Message) {
        if (message.author.bot) return;

        const context: CommandContext = {
            message,
            isThread: message.channel.isThread()
        };

        // Handle stop command
        if (message.content.toLowerCase() === 'stop') {
            const stopCommand = this.commands.get('stop');
            if (stopCommand) await stopCommand.execute(context);
            return;
        }

        // Handle thread command
        if (message.content.toLowerCase() === 'branch' && message.reference) {
            const threadCommand = this.commands.get('thread');
            if (threadCommand) await threadCommand.execute(context);
            return;
        }
    }

    public async refresh() {
        this.modelDirectories = await this.modelManager.loadModelDirectories();
        await this.registerSlashCommands();
    }
}

export function createCommandRegistry(client: Client, modelManager: ModelManager): CommandRegistry {
    return new CommandRegistry(client, modelManager);
}
