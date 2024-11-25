# vnc-lm

### Introduction
Message with Claude-3.5-Sonnet, Llama-3.2, GPT-4o, and others through Discord. 
 
Load and manage language models through a local [**ollama**](https://github.com/ollama/ollama) instance or hosted APIs with [**LiteLLM**](https://www.litellm.ai/). Configure model parameters, pull conversations, and refine prompts to improve responses.

![Screen Recording 2024-11-24 at 10 06 53 PM](https://github.com/user-attachments/assets/9bd73334-74e0-40dd-b17b-a17353b17d63)
<br>

### Features
#### Model Management

Load models using the `/model` command. Configure model behavior by adjusting the `system_prompt` (base instructions), `temperature` (response randomness), and `num_ctx` (context length) parameters. 

```console
# load and configure models
/model model:command-r-plus-08-2024 system_prompt: You are a helpful assistant. temperature: 0.4
```

The bot creates a new thread upon successful model loading and sends a confirmation notification. The `/model` command only works in main channels, not threads. Thread names are automatically generated from keywords in your initial prompt. To switch models within a thread, use `+` followed by any distinctive part of the model name:

```console
# switch to claude-sonnet-3.5
+ claude, + sonnet, + 3.5

# switch to gpt-4o
+ gpt, + 4o

# switch to granite-dense
+ granite, + dense
```

When you switch models within a thread, your conversation history and settings (`system_prompt` and `temperature`) stay unchanged. Resume any conversation by sending a new message.

Download models by sending a model tag link in a channel.

```console
# model tag links
https://ollama.com/library/llama3.2:1b-instruct-q8_0

https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/blob/main/Llama-3.2-1B-Instruct-Q8_0.gguf
```

Local models can be removed with the `remove` parameter of `/model`. 

> Model downloading and removal is turned off by default and can be enabled by configuring the `.env`.

Reply to any message with `_` to create a new branch of the conversation. The new branch will include a relationship diagram and conversation summary up to the point where it branched. Hop between branches while keeping separate conversation histories, letting you explore different paths with any model.


#### QoL Improvements
Long messages are automatically split into pages during generation. Message streaming works with ollama, while hosted APIs handle responses without streaming. The context window supports text files, links, and images. Docker provides the simplest setup.

Edit any prompt to refine a model's response. The bot will generate a new response using your edited prompt, replacing the previous one. Edits and deletions in Discord sync immediately with the conversation cache and update the model's context for future responses.

Conversations are stored in `bot_cache.json` and persist across Docker container restarts with a [**bash script**](https://github.com/jake83741/vnc-lm/blob/main/src/managers/cache/entrypoint.sh).

While both hosted APIs and Ollama support vision functionality, not all models have vision capabilities.

> Message `stop` to end message generation early.

### LiteLLM Integration

With [**LiteLLM**](https://www.litellm.ai/) integration, a wide range of hosted language models can be accessed through a single proxy interface. Any model provider available through LiteLLM including OpenAI, Anthropic, Azure, and others is supported.

Add models by filling out `litellm_config.yaml` file in the `vnc-lm/` directory. The configuration supports all providers and parameters available through LiteLLM's proxy.

LiteLLM is packaged with the bot and starts automatically when the Docker container is built. While LiteLLM integration is available, the bot can function solely with ollama.

### Requirements 
[**Docker**](https://www.docker.com/): Docker is a platform designed to help developers build, share, and run container applications. We handle the tedious setup, so you can focus on the code.

### Environment Configuration
```console
# clone the repository
git clone https://github.com/jake83741/vnc-lm.git

# enter the directory
cd vnc-lm

# rename the env file
mv .env.example .env
```

----

```console
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
# example provider api key. include as many as necessary.
OPENAI_API_KEY=sk-...8YIH
ANTHROPIC_API_KEY=sk-...2HZF
```

### LiteLLM configuration
```console
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

### Docker Installation (Preferred)
```console
# build the container with Docker
docker compose up --build --no-color
```

![Screen Recording 2024-11-24 at 12 51 26 PM](https://github.com/user-attachments/assets/57f207db-ffec-4745-b5e3-784db59564aa)
<sub>successful build</sub>

> Send `/help` for instructions on how to use the bot.

### Tree Diagram
```console
.
├── api-connections
│   ├── base-client.ts
│   ├── factory.ts
│   └── provider
│       ├── litellm
│       │   └── client.ts
│       └── ollama
│           └── client.ts
├── bot.ts
├── commands
│   ├── command-registry.ts
│   ├── help-command.ts
│   ├── loading-comand.ts
│   ├── model-command.ts
│   ├── remove-command.ts
│   ├── services
│   │   ├── ocr.ts
│   │   └── scraper.ts
│   ├── stop-command.ts
│   └── thread-command.ts
├── managers
│   ├── cache
│   │   ├── entrypoint.sh
│   │   ├── manager.ts
│   │   └── store.ts
│   └── generation
│       ├── controller.ts
│       ├── messages.ts
│       ├── pages.ts
│       ├── processor.ts
│       └── stream.ts
└── utilities
    ├── index.ts
    ├── settings.ts
    └── types.ts
```

### Dependencies
<details>
<br>
 
```console
{
  "dependencies": {
    "@azure-rest/ai-inference": "latest",
    "@azure/core-auth": "latest",
    "@mozilla/readability": "^0.5.0",
    "@types/xlsx": "^0.0.35",
    "axios": "^1.7.2",
    "cohere-ai": "^7.14.0",
    "discord.js": "^14.15.3",
    "dotenv": "^16.4.5",
    "jsdom": "^24.1.3",
    "keyword-extractor": "^0.0.27",
    "puppeteer": "^22.14.0",
    "sharp": "^0.33.5",
    "tesseract.js": "^5.1.0"
  },
  "devDependencies": {
    "@types/jsdom": "^21.1.7",
    "@types/node": "^18.15.25",
    "typescript": "^5.1.3"
  }
}
```

</details>

### Notes
<details>
<br>

1. The `num_ctx` parameter is strictly for local models.
2. Set higher `num_ctx` values when using attachments with large amounts of text.

</details>

### License
This project is licensed under the MIT License.
