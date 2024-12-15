import { CommandInteraction, Message, EmbedBuilder, CacheType, ThreadChannel, TextChannel } from 'discord.js';

// Core command types
export interface CommandOptions {
    name: string;
    description: string;
    isAdminOnly?: boolean;
}

export interface CommandContext {
    interaction?: CommandInteraction<CacheType>;
    message?: Message;
    isThread: boolean;
}

// Base command class
export abstract class BaseCommand {
    protected name: string;
    protected description: string;
    protected isAdminOnly: boolean;

    constructor(options: CommandOptions) {
        this.name = options.name;
        this.description = options.description;
        this.isAdminOnly = options.isAdminOnly || false;
    }

    // Response handling methods
    protected async sendResponse(
        context: CommandContext,
        content: string | EmbedBuilder,
        ephemeral: boolean = true
    ) {
        const { interaction, message, isThread } = context;
    
        if (interaction) {
            const response = typeof content === 'string' 
                ? { content, ephemeral } 
                : { embeds: [content], ephemeral };
    
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(response);
            } else {
                await interaction.followUp(response);
            }
        } else if (message) {
            // Fix the send method error by checking channel type
            if ('send' in message.channel) {
                await message.channel.send(
                    typeof content === 'string' ? { content } : { embeds: [content] }
                );
            }
        }
    }

    // Thread creation helper
    protected async createThread(
        channel: TextChannel,
        name: string,
        reason?: string
    ): Promise<ThreadChannel> {
        return await channel.threads.create({
            name: name.slice(0, 100), // Discord's thread name limit
            reason: reason || `Command: ${this.name}`
        });
    }

    // Permission checking
    protected async checkPermissions(
        context: CommandContext,
        adminId?: string | null // Allow null here
    ): Promise<boolean> {
        if (!this.isAdminOnly) return true;
        
        const userId = context.interaction?.user.id || context.message?.author.id;
        // If adminId is null or undefined, treat it as no admin being set.
        if (!adminId && userId) return false; //If no admin is set only admin commands will fail. User commands will succeed.
        if (!userId) return false; // Failsafe
        
        return userId === adminId;
    }

    // Error handling wrapper
    protected async executeWithErrorHandling<T>(
        context: CommandContext,
        action: () => Promise<T>
    ): Promise<T | void> {
        try {
            return await action();
        } catch (error) {
            console.error(`Error in ${this.name} command:`, error);
            await this.sendResponse(
                context,
                `An error occurred while executing the ${this.name} command.`,
                true
            );
        }
    }

    // Abstract method for command execution
    abstract execute(context: CommandContext, ...args: any[]): Promise<void>;
}

// Utility types for command parameters
export interface ModelCommandParams {
    modelName: string;
    numCtx?: number | undefined;
    systemPrompt?: string | undefined;
    temperature?: number | undefined;
    remove?: boolean;
}

export interface ThreadCommandParams {
    replyTo: Message;
    content: string;
}

export type CommandResponse = {
    success: boolean;
    message: string;
    data?: any;
};