import { BaseClient } from '../../base-client';
import { ChatMessage, MessageContent } from '../../../utilities/index';
import { Readable } from 'stream';
import axios from 'axios';

export class LiteLLMClient extends BaseClient {
    private baseUrl: string;

    constructor(baseUrl: string = 'http://litellm:4000') {
        super();
        this.baseUrl = baseUrl;
    }

    private async makeRequest(messages: any[], temperature: number, modelName: string) {
        return await axios({
            method: 'post',
            url: `${this.baseUrl}/v1/chat/completions`,
            data: {
                model: modelName,
                messages: messages,
                temperature: temperature,
                stream: false,
                max_tokens: 4096
            }
        });
    }

    async generateResponse(
        prompt: string,
        context: string | null = null,
        images: string[] = [],
        cachedMessages?: ChatMessage[]
    ): Promise<Readable> {
        if (!this.modelName) {
            throw new Error("No active model. Use /model command to select one.");
        }
    
        const messages = [];
        if (this.system) {
            messages.push({ role: "system", content: this.system });
        }

        // Handle cached messages, including any attached images
        if (cachedMessages) {
            messages.push(...cachedMessages.map(msg => {
                if (msg.attachments?.some(att => att.type === 'image')) {
                    const content: MessageContent[] = [
                        { type: "text", text: msg.content as string },
                        ...msg.attachments
                            .filter(att => att.type === 'image')
                            .map(image => ({
                                type: "image_url" as const,
                                image_url: {
                                    url: `data:image/jpeg;base64,${image.content}`
                                }
                            }))
                    ];
                    return { role: msg.role, content };
                }
                return {
                    role: msg.role,
                    content: typeof msg.content === 'string' ? msg.content : msg.content[0]?.text || ''
                };
            }));
        }
    
        // Format the user message with images differently
        if (images.length > 0) {
            const content: MessageContent[] = [
                { type: "text", text: prompt },
                ...images.map(image => ({
                    type: "image_url" as const,
                    image_url: {
                        url: `data:image/jpeg;base64,${image}`
                    }
                }))
            ];
            messages.push({ role: "user", content });
        } else {
            messages.push({ role: "user", content: prompt });
        }
    
        const stream = new Readable({ read() {} });
    
        try {
            let response;
            try {
                // First attempt with images if present
                response = await this.makeRequest(messages, this.temperature, this.modelName);
            } catch (firstError: any) {
                // If we get a 400 error and have images/complex content, retry with text-only
                if (firstError.response?.status === 400) {
                    // Convert all messages to text-only format
                    const textOnlyMessages = messages.map(msg => ({
                        role: msg.role,
                        content: Array.isArray(msg.content) 
                            ? msg.content.find(c => c.type === 'text')?.text || ''
                            : typeof msg.content === 'string' 
                                ? msg.content 
                                : ''
                    }));

                    response = await this.makeRequest(textOnlyMessages, this.temperature, this.modelName);
                } else {
                    throw firstError;
                }
            }

            const content = response.data.choices[0].message.content;

            stream.push(JSON.stringify({
                response: content,
                context: context,
                done: true
            }) + '\n');

            // Update conversation history if not using cached messages
            if (!cachedMessages) {
                if (images.length > 0) {
                    const historyContent: MessageContent[] = [
                        { type: "text", text: prompt },
                        ...images.map(image => ({
                            type: "image_url" as const,
                            image_url: {
                                url: `data:image/jpeg;base64,${image}`
                            }
                        }))
                    ];
                    this.conversationHistory.push({
                        role: 'user',
                        content: historyContent
                    });
                } else {
                    this.conversationHistory.push({ 
                        role: 'user', 
                        content: prompt 
                    });
                }
                this.conversationHistory.push({ 
                    role: 'assistant', 
                    content: content 
                });
            }

            stream.push(null);

        } catch (error: any) {
            if (error.response) {
                console.error('Error response data:', error.response.data);
                console.error('Error response status:', error.response.status);
                console.error('Error response headers:', error.response.headers);
            } else if (error.request) {
                console.error('Error request:', error.request);
            } else {
                console.error('Error message:', error.message);
            }
            stream.destroy(error);
        }

        return stream;
    }
}
