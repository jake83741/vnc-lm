// api-connections/base-client.ts
import { ChatMessage, BaseRequestOptions, Readable } from '../utilities/types';
import axios, { CancelTokenSource } from 'axios';

export abstract class BaseClient {
    public modelName: string | null = null;
    public system: string | null = null;
    public temperature: number = 0.4;
    protected conversationHistory: ChatMessage[] = [];
    protected cancelTokenSource: CancelTokenSource;

    constructor() {
        this.cancelTokenSource = axios.CancelToken.source();
    }

    abstract generateResponse(
        prompt: string,
        context?: string | null,
        images?: string[],
        cachedMessages?: ChatMessage[]
    ): Promise<Readable>;

    public getConversationHistory(): ChatMessage[] {
        return this.conversationHistory;
    }

    public setConversationHistory(history: ChatMessage[]): void {
        this.conversationHistory = history;
    }

    public resetContext(): void {
        this.conversationHistory = [];
    }

    public setSystem(system: string | null): void {
        this.system = system;
    }

    public clearSystem(): void {
        this.system = null;
    }

    public setTemperature(temp: number): void {
        this.temperature = temp;
    }

    public getContext(): string | null {
        return null;
    }

    public updateInHistory(oldContent: string, newContent: string): void {
        const index = this.conversationHistory.findIndex(msg => 
            typeof msg.content === 'string' && msg.content === oldContent
        );
        if (index !== -1) {
            this.conversationHistory[index].content = newContent;
        }
    }

    public removeFromHistory(content: string): void {
        this.conversationHistory = this.conversationHistory.filter(msg => 
            typeof msg.content === 'string' && msg.content !== content
        );
    }

    public cancelRequest(reason: string): void {
        if (this.cancelTokenSource) {
            this.cancelTokenSource.cancel(reason);
            this.cancelTokenSource = axios.CancelToken.source();
        }
    }
}