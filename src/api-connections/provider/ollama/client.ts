import { Readable } from 'stream';
import axios from 'axios';
import { BaseClient } from '../../base-client';
import { ChatMessage, OllamaRequestOptions, ApiResponse } from '../../../utilities/types';
import { defaultNumCtx, defaultKeepAlive } from '../../../utilities/settings';

export class OllamaClient extends BaseClient {
   private client = axios.create({ baseURL: '' });
   public numCtx = defaultNumCtx;
   public keepAlive = defaultKeepAlive;
   public context: string | null = null;
   private currentStreamedContent: string = '';

   constructor(baseUrl: string = process.env.OLLAMAURL || 'http://localhost:11434') {
       super();
       this.client = axios.create({ baseURL: `${baseUrl}/api` });
   }

   private async makeRequest(messages: ChatMessage[], options: OllamaRequestOptions): Promise<Readable> {
       const stream = new Readable({ read() {} });
       
       try {
           // Transform messages to include any attached images
           const transformedMessages = messages.map(msg => {
               if (msg.attachments?.some(att => att.type === 'image')) {
                   return {
                       role: msg.role,
                       content: msg.content,
                       images: msg.attachments
                           .filter(att => att.type === 'image')
                           .map(image => image.content)
                   };
               }
               return msg;
           });

           const response = await this.client.post('chat', {
               model: options.model,
               messages: transformedMessages,
               stream: true,
               options: {
                   temperature: this.temperature,
                   num_ctx: this.numCtx,
                   keep_alive: this.keepAlive,
                   ...(options.options || {})
               }
           }, {
               cancelToken: this.cancelTokenSource.token,
               responseType: 'stream'
           });

           this.currentStreamedContent = '';

           response.data.on('data', (chunk: Buffer) => {
               chunk.toString().split('\n').filter(line => line.trim()).forEach(line => {
                   try {
                       const data = JSON.parse(line);
                       if (data.message?.content) {
                           this.currentStreamedContent += data.message.content;
                           stream.push(JSON.stringify({
                               response: data.message.content,
                               context: this.context,
                               done: false
                           }) + '\n');
                       }
                   } catch (error) {
                       console.error('Parse error:', error);
                   }
               });
           });

           response.data.on('end', () => {
               if (this.currentStreamedContent.trim()) {
                   // Only update conversation history if we're not using cached messages
                   if (!options.cachedMessages) {
                       const userMessage = messages[messages.length - 1];
                       if (!this.conversationHistory.some(msg => 
                           msg.role === userMessage.role && msg.content === userMessage.content)) {
                           this.conversationHistory.push({
                               role: userMessage.role,
                               content: userMessage.content,
                               attachments: userMessage.attachments
                           });
                       }
                       
                       this.conversationHistory.push({
                           role: 'assistant',
                           content: this.currentStreamedContent.trim()
                       });
                   }
               }
               stream.push(null);
           });

           response.data.on('error', (error: Error) => {
               if (axios.isCancel(error)) {
                   stream.push(JSON.stringify({
                       context: this.context,
                       done: true,
                       isCancelled: true
                   }) + '\n');
                   stream.push(null);
               } else {
                   stream.destroy(error);
               }
           });

           return stream;

       } catch (error) {
           stream.destroy(error as Error);
           throw error;
       }
   }

   public async generateResponse(
       prompt: string, 
       context: string | null = null, 
       images: string[] = [],
       cachedMessages?: ChatMessage[]
   ): Promise<Readable> {
       if (!this.modelName) throw new Error("No active model. Use /model command to select one.");
       
       if (context && !this.conversationHistory.length && !cachedMessages) {
           this.conversationHistory = [{ role: 'assistant', content: context }];
       }
       
       return this.generate({
           model: this.modelName,
           prompt,
           system: this.system,
           context,
           temperature: this.temperature,
           options: { 
               num_ctx: this.numCtx, 
               keep_alive: this.keepAlive 
           },
           images: images.length ? images : undefined,
           cachedMessages
       });
   }

   public async generate(options: OllamaRequestOptions): Promise<Readable> {
       let userMessage: ChatMessage;
       
       if (options.images?.length) {
           userMessage = {
               role: 'user',
               content: options.prompt,
               attachments: options.images.map(image => ({
                   type: 'image' as const,
                   name: 'image',
                   content: image
               }))
           };
       } else {
           userMessage = { 
               role: 'user', 
               content: options.prompt
           };
       }
   
       const messages = options.system ? 
           [{ role: 'system', content: options.system }, 
            ...(options.cachedMessages || this.conversationHistory), 
            userMessage] : 
           [...(options.cachedMessages || this.conversationHistory), userMessage];
   
       const stream = await this.makeRequest(messages, options);
       return stream;
   }

   public async listModels(): Promise<ApiResponse> {
       return this.client.get<ApiResponse>('tags').then(response => response.data);
   }

   public async pullModel(modelTag: string): Promise<Readable> {
       return this.client.post('pull', { name: modelTag }, { responseType: 'stream' }).then(response => response.data);
   }

   public async deleteModel(modelName: string): Promise<void> {
       return this.client.delete('delete', { data: { name: modelName } });
   }

   public async copyModel(source: string, destination: string): Promise<void> {
       return this.client.post('copy', { source, destination });
   }

   public getContext(): string | null { 
       return this.context; 
   }

   public setNumCtx(numCtx: number): void { 
       this.numCtx = numCtx; 
   }

   public setKeepAlive(keepAlive: string): void { 
       this.keepAlive = keepAlive; 
   }
}

export const defaultClient = new OllamaClient();
export const chatBot = defaultClient;