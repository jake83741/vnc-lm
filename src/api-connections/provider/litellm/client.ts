import { BaseClient } from '../../base-client';
import { ChatMessage, MessageContent } from '../../../utilities/types';
import { Readable } from 'stream';
import axios from 'axios';

export class LiteLLMClient extends BaseClient {
    private baseUrl: string;

    constructor(baseUrl: string = 'http://litellm:4000') {
        super();
        this.baseUrl = baseUrl;
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
            const response = await axios({
                method: 'post',
                url: `${this.baseUrl}/v1/chat/completions`,
                data: {
                    model: this.modelName,
                    messages: messages,
                    temperature: this.temperature,
                    stream: false,
                    max_tokens: 4096
                }
            });

            // Get the complete response content
            const content = response.data.choices[0].message.content;

            // Push the entire response as one chunk
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

            // End the stream
            stream.push(null);

        } catch (error: any) {
            // Log the full error details for debugging
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