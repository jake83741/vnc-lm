# vnc-lm

### Introduction
Message with Claude 3.5 Sonnet, Llama 3.3, GPT-4o, and other LLMs through Discord.
 
**vnc-lm** is a Discord bot for messaging with language models. Configure model parameters, branch conversations, and edit prompts to improve responses. It is integrated with [ollama](https://github.com/ollama/ollama) and [LiteLLM](https://github.com/BerriAI/litellm).

<details><summary>Supported Providers</summary> <br>
 
| Supported Providers |||
|----------|----------|----------|
| [OpenAI](https://docs.litellm.ai/docs/providers/openai) | [Huggingface](https://docs.litellm.ai/docs/providers/huggingface) | [Cloudflare Workers AI](https://docs.litellm.ai/docs/providers/cloudflare_workers) |
| [OpenAI (Text Completion)](https://docs.litellm.ai/docs/providers/text_completion_openai) | [Databricks](https://docs.litellm.ai/docs/providers/databricks) | [DeepInfra](https://docs.litellm.ai/docs/providers/deepinfra) |
| [OpenAI-Compatible Endpoints](https://docs.litellm.ai/docs/providers/openai_compatible) | [IBM watsonx.ai](https://docs.litellm.ai/docs/providers/watsonx) | [AI21](https://docs.litellm.ai/docs/providers/ai21) |
| [Azure OpenAI](https://docs.litellm.ai/docs/providers/azure) | [Predibase](https://docs.litellm.ai/docs/providers/predibase) | [NLP Cloud](https://docs.litellm.ai/docs/providers/nlp_cloud) |
| [Azure AI Studio](https://docs.litellm.ai/docs/providers/azure_ai) | [Nvidia NIM](https://docs.litellm.ai/docs/providers/nvidia_nim) | [Replicate](https://docs.litellm.ai/docs/providers/replicate) |
| [VertexAI](https://docs.litellm.ai/docs/providers/vertex) | [XAI](https://docs.litellm.ai/docs/providers/xai) | [Together AI](https://docs.litellm.ai/docs/providers/togetherai) |
| [Gemini - Google AI Studio](https://docs.litellm.ai/docs/providers/gemini) | [LM Studio](https://docs.litellm.ai/docs/providers/lm_studio) | [Voyage AI](https://docs.litellm.ai/docs/providers/voyage) |
| [Anthropic](https://docs.litellm.ai/docs/providers/anthropic) | [Cerebras](https://docs.litellm.ai/docs/providers/cerebras) | [Jina AI](https://docs.litellm.ai/docs/providers/jina_ai) |
| [AWS Sagemaker](https://docs.litellm.ai/docs/providers/aws_sagemaker) | [Volcano Engine](https://docs.litellm.ai/docs/providers/volcano) | [Aleph Alpha](https://docs.litellm.ai/docs/providers/aleph_alpha) |
| [AWS Bedrock](https://docs.litellm.ai/docs/providers/bedrock) | [Triton Inference Server](https://docs.litellm.ai/docs/providers/triton-inference-server) | [Baseten](https://docs.litellm.ai/docs/providers/baseten) |
| [LiteLLM Proxy (LLM Gateway)](https://docs.litellm.ai/docs/providers/litellm_proxy) | [Ollama](https://docs.litellm.ai/docs/providers/ollama) | [OpenRouter](https://docs.litellm.ai/docs/providers/openrouter) |
| [Mistral AI API](https://docs.litellm.ai/docs/providers/mistral) | [Perplexity AI](https://docs.litellm.ai/docs/providers/perplexity) | [PaLM API - Google](https://docs.litellm.ai/docs/providers/palm) |
| [Codestral API](https://docs.litellm.ai/docs/providers/codestral) | [FriendliAI](https://docs.litellm.ai/docs/providers/friendliai) | [Sambanova](https://docs.litellm.ai/docs/providers/sambanova) |
| [Cohere](https://docs.litellm.ai/docs/providers/cohere) | [Groq](https://docs.litellm.ai/docs/providers/groq) | [Custom API Server](https://docs.litellm.ai/docs/providers/custom_llm_server) |
| [Anyscale](https://docs.litellm.ai/docs/providers/anyscale) | [Github](https://docs.litellm.ai/docs/providers/github) | [Petals](https://docs.litellm.ai/docs/providers/petals) |
| [Fireworks AI](https://docs.litellm.ai/docs/providers/fireworks_ai) | [Deepseek](https://docs.litellm.ai/docs/providers/deepseek) | [Xinference](https://docs.litellm.ai/docs/providers/xinference) |
| [Clarifai](https://docs.litellm.ai/docs/providers/clarifai) | [VLLM](https://docs.litellm.ai/docs/providers/vllm) |

</details>

![Screen Recording 2024-12-10 at 11 32 16 PM](https://github.com/user-attachments/assets/e880193a-7551-4f56-a8f1-6871dc4872d7)
<br>

### Features
#### Model Management

Load models using the `/model` command. Configure model behavior by adjusting the `system_prompt` (base instructions), `temperature` (response randomness), and `num_ctx` (context length) parameters. 

```shell
# model loading / configuration example
/model model:granite3-dense:8b-instruct-q8_0 system_prompt: You are a helpful assistant. temperature: 0.4
```

The bot creates a new thread upon successful model loading and sends a confirmation notification. To switch models within a thread, use `+` followed by any distinctive part of the model name:

```shell
# model switching examples

# switch to claude-sonnet-3.5
+ claude, + sonnet, + 3.5

# switch to gpt-4o
+ gpt, + 4o

# switch to granite-dense
+ granite, + dense
```

When you switch models within a thread, your conversation history and settings (`system_prompt` and `temperature`) stay unchanged.

Reply `branch` to any message in a thread to create a new branch of the conversation. The new branch will include a link to the original thread and a conversation summary up to the point where it branched. Hop between branches while keeping separate conversation histories, letting you explore different paths with any model.

#### QoL Improvements
Long messages are automatically split into pages. The context window supports text files, links, and images. Images can be handled either with multi-modal models or with OCR depending on how the `.env` is configured. The bot can be configured to require mention or to respond without a direct mention.

Edit any prompt to refine a model's response. The bot will generate a new response using your edited prompt, replacing the previous one. Edits and deletions in Discord sync immediately with the conversation cache and update the model's context for future responses. Conversations are stored in `bot_cache.json` and persist across Docker container restarts with a [bash script](https://github.com/jake83741/vnc-lm/blob/main/src/managers/cache/entrypoint.sh).

### ollama Integration

Download ollama models by sending a model tag link in a channel.

```shell
# model tag link examples
https://ollama.com/library/llama3.2:1b-instruct-q8_0
https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/blob/main/Llama-3.2-1B-Instruct-Q8_0.gguf
```

Local models can be removed with the `remove` parameter of `/model`. 

```shell
# ollama model removal example
/model model:granite3-dense:8b-instruct-q8_0 remove:True
```

> [!NOTE]  
> Enable model downloading and removal by adding your Discord user ID to the `.env`.

The `num_ctx` parameter for `/model` can only be used with ollama models.

### LiteLLM Integration

With [LiteLLM](https://www.litellm.ai/) integration, a wide range of language model APIs can be accessed through a single proxy interface. Any model provider available through LiteLLM is supported. 

LiteLLM includes support for OpenAI-compatible APIs. This opens up support for many popular open source local LLM services.

Add models by filling out `litellm_config.yaml` file in the `vnc-lm/` directory. The configuration supports all providers and parameters available through LiteLLM's proxy.

LiteLLM is packaged with the bot and starts automatically when the Docker container is built. While LiteLLM integration is available, the bot can function solely with ollama.

### Requirements 
[Docker](https://www.docker.com/): Docker is a platform designed to help developers build, share, and run container applications. We handle the tedious setup, so you can focus on the code.

### Environment Configuration
```shell
# clone the repository or download a recent release
git clone https://github.com/jake83741/vnc-lm.git

# enter the directory
cd vnc-lm

# rename the env file
mv .env.example .env
```

----

```shell
# configure the below .env fields

# Discord bot token
TOKEN=
# administrator Discord user id
ADMIN=
# require bot mention (default: false)
REQUIRE_MENTION=

# turn vision on or off. turning vision off will turn ocr on. (default: false)
USE_VISION=

# leave blank to not use ollama
OLLAMAURL=http://host.docker.internal:11434
# example provider api keys
OPENAI_API_KEY=sk-...8YIH
ANTHROPIC_API_KEY=sk-...2HZF
```
<sub> [Generating a bot token](https://discordjs.guide/preparations/setting-up-a-bot-application.html) </sub> <br>
<sub> [Inviting the bot to a server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html) </sub>

### LiteLLM configuration
```shell
# add models to the litellm_config.yaml
# it is not necessary to include ollama models here
model_list:
- model_name: gpt-3.5-turbo-instruct
  litellm_params:
    model: openai/gpt-3.5-turbo-instruct
    api_key: os.environ/OPENAI_API_KEY
- model_name: 
  litellm_params:
    model: 
    api_key: 
```
<sub> [Additional parameters may be required](https://github.com/jake83741/vnc-lm/blob/a902b22c616e6ae2958a54ca230725c358068722/litellm_config.yaml) </sub>

### Docker Installation
```shell
# build the container with Docker
docker compose up --build --no-color
```

![Screen Recording 2024-11-24 at 12 51 26 PM](https://github.com/user-attachments/assets/57f207db-ffec-4745-b5e3-784db59564aa)
<sub>successful build</sub>

> [!NOTE]  
> Send `/help` for instructions on how to use the bot.

### Tree Diagram
```shell
.
├── api-connections/             
│   ├── base-client.ts           # Abstract base class defining common client interface and methods
│   ├── factory.ts               # Factory class for instantiating appropriate model clients
│   └── provider/                
│       ├── litellm/            
│       │   └── client.ts        # Client implementation for LiteLLM API integration
│       └── ollama/
│           └── client.ts        # Client implementation for Ollama API integration
├── bot.ts                       # Main bot initialization and event handling setup
├── commands/                    
│   ├── base.ts                  # Base command class with shared command functionality
│   ├── handlers.ts              # Implementation of individual bot commands
│   └── registry.ts              # Command registration and slash command setup
├── managers/                    
│   ├── cache/                   
│   │   ├── entrypoint.sh        # Cache initialization script
│   │   ├── manager.ts           # Cache management implementation
│   │   └── store.ts             # Cache storage and persistence
│   └── generation/              
│       ├── core.ts              # Core message generation logic
│       ├── formatter.ts         # Message formatting and pagination
│       └── generator.ts         # Stream-based response generation
└── utilities/                   
    ├── error-handler.ts         # Global error handling
    ├── index.ts                 # Central export point for utilities
    └── settings.ts              # Global settings and configuration
```

### Dependencies
<details>
<br>
 
```shell
{
  "dependencies": {
    "@mozilla/readability": "^0.5.0",  # Library for extracting readable content from web pages
    "axios": "^1.7.2",                 # HTTP client for making API requests
    "discord.js": "^14.15.3",          # Discord API wrapper for building Discord bots
    "dotenv": "^16.4.5",               # Loads environment variables from .env files
    "jsdom": "^24.1.3",                # DOM implementation for parsing HTML in Node.js
    "keyword-extractor": "^0.0.27",    # Extracts keywords from text for generating thread names
    "sharp": "^0.33.5",                # Image processing library for resizing/optimizing images  
    "tesseract.js": "^5.1.0"           # Optical Character Recognition (OCR) for extracting text from images
  },
  "devDependencies": {
    "@types/axios": "^0.14.0",
    "@types/dotenv": "^8.2.0",
    "@types/jsdom": "^21.1.7",
    "@types/node": "^18.15.25",
    "typescript": "^5.1.3"
  }
}
```

</details>

### Troubleshooting
<details>

#### Context Window Issues
When sending text files to a local model, be sure to set a proportional `num_ctx` value with `/model`. <br>

#### Discord API issues
Occasionally the Discord API will throw up errors in the console.

```shell
# discord api error examples
DiscordAPIError[10062]: Unknown interaction

DiscordAPIError[40060]: Interaction has already been acknowledged
```

The errors usually seem to be related to clicking through pages of an embedded response. The errors are not critical and should not cause the bot to crash. 

#### OpenAI-Compatible API Issues
When adding a model to the `litellm_config.yaml` from a service that uses a local API ([text-generation-webui](https://github.com/oobabooga/text-generation-webui) for example), use this example: <br>

```shell
# add openai/ prefix to route as OpenAI provider
# add api base, use host.docker.interal:{port}/v1
# api key to send your model. use a placeholder when the service doesn't use api keys
model_list:
  - model_name: my-model
    litellm_params:
      model: openai/<your-model-name>
      api_base: <model-api-base>       
      api_key: api-key                 
```
#### LiteLLM Issues
If LiteLLM is exiting in the console log when doing `docker compose up --build --no-color`. Open the `docker-compose.yaml` and revise the following line and run `docker compose up --build --no-color` again to see more descriptive logs.

```shell
# original
command: -c "exec litellm --config /app/config.yaml >/dev/null 2>&1"
# revised
command: -c "exec litellm --config /app/config.yaml"
```

Most issues will be related to the `litellm_config.yaml` file. Double check your model_list vs the examples shown in the [LiteLLM docs](https://docs.litellm.ai/docs/providers). Some providers require [additional litellm_params](https://github.com/jake83741/vnc-lm/blob/a902b22c616e6ae2958a54ca230725c358068722/litellm_config.yaml).

#### Cache issues
Cache issues are rare and difficult to reproduce but if one does occur, deleting `bot_cache.json` and re-building the bot should correct it. 

</details>

### License
This project is licensed under the MPL-2.0 license.
