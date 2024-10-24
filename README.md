# vnc-lm

<sub>10-23-2024: Cleaned up file architecture.</sub> <br>
<sub>10-19-2024: Added support for HuggingFace links.</sub>

### Introduction
[**vnc-lm**](https://github.com/jake83741/vnc-lm) is a Discord bot that lets you talk with and configure language models in your server. It uses [**ollama**](https://github.com/ollama/ollama) to manage and run different models.



![Screen Recording 2024-10-20 at 2 10 47 AM](https://github.com/user-attachments/assets/bd4eadaa-f1e5-4c06-975e-33ed74fd7de1)
<br> <sup>Web scraping example</sup>
<br>
![Screen Recording 2024-10-20 at 2 18 32 AM](https://github.com/user-attachments/assets/283c51ea-ad05-4a20-8cf1-c3a241b8e6e8)
<br> <sup>Model pulling example</sup>

### Features
#### Model Management
Switch models using the `/model` command and adjust parameters like `num_ctx`, `system_prompt`, and `temperature`. Notifications automatically send when models load into RAM. Models can be removed with the `remove` parameter. Download models directly through Discord by messaging a model tag link.

```
https://ollama.com/library/phi3.5:3.8b-mini-instruct-q2_K
```

```
https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/blob/main/Llama-3.2-1B-Instruct-Q8_0.gguf
```

> 🚧 Model downloading and removal is turned off by default and can be enabled by configuring the `.env`. 
 
#### QoL Improvements
Streaming message generation with messages longer than 1500 characters split into pages. Attachments like text-based files, web links, and screenshots can be added into the context window. 

Switch between conversations by clicking `rejoin conversation` in the context menu. Conversations can be forked from any point and with different models. All messages are cached and organized into conversations. `Entrypoint.sh` helps the message cache persist across Docker containers. 

> 🚥 Messaging `stop` will end message generation early. Messaging `reset` returns models to their default configuration.

### Requirements 
[**Ollama**](https://github.com/ollama/ollama): Get up and running with Llama 3.1, Mistral, Gemma 2, and other large language models. <br>
[**Docker**](https://www.docker.com/): Docker is a platform designed to help developers build, share, and run container applications. We handle the tedious setup, so you can focus on the code.

### Environment Configuration
```
git clone https://github.com/jake83741/vnc-lm.git
cd vnc-lm
```

Rename `.env.example` to `.env`.

Configure the below fields in the `.env`: 

**`TOKEN=`** Your Discord bot token. Use the [**Discord Developer Portal**](https://discord.com/developers/applications/) to create this. Check the necessary permissions for your Discord bot.<br>
**`OLLAMAURL=`** The URL of your Ollama server. See [**API documentation**](https://github.com/ollama/ollama/blob/main/docs/api.md#request). Docker requires `http://host.docker.internal:11434`<br>
**`NUM_CTX=`** Value controlling context window size. Defaults to 2048.<br>
**`TEMPERATURE=`** Value controlling the randomness of responses. Defaults to 0.4.<br>
**`KEEP_ALIVE=`** Value controlling how long a model stays in memory. Defaults to 45m.<br>
**`CHARACTER_LIMIT=`** Value controlling the character limit for page embeds. Defaults to 1500.<br>
**`API_RESPONSE_UPDATE_FREQUENCY=`** Value controlling amount of API responses to chunk before updating message. A low number will cause Discord API to throttle. Defaults to 10.<br>
**`ADMIN=`** Discord user ID. This will enable downloading and removing models.<br>
**`REQUIRE_MENTION=`** Require the bot to be mentioned or not. Defaults to false.<br>

### Docker Installation (Preferred)
```
docker compose up --build
```

> 💡 Send `/help` for instructions on how to use the bot.

### Manual Installation
<details>
<br>

 ```
npm install
npm run build
npm start
 ```
</details>

### Usage

[<img width="977" alt="image" src="https://github.com/user-attachments/assets/38e254cc-b6b5-4de1-b3a9-59176e133e09">
](https://github.com/jake83741/vnc-lm/blob/main/imgs/366593695-38e254cc-b6b5-4de1-b3a9-59176e133e09.png?raw=true)
<br> 
Models can be loaded, configured, or removed with `/model`.  Model behavior can be quickly changed by setting the optional parameters for `num_ctx`, `system_prompt`, and `temperature`. 
<br>
<br>


[![image](https://github.com/user-attachments/assets/7f629653-48ff-46f8-9ee9-ed306cceea55)
](https://github.com/jake83741/vnc-lm/blob/main/imgs/365389934-7f629653-48ff-46f8-9ee9-ed306cceea55.png?raw=true)
<br> 
Select `Rejoin Conversation` through the Discord context menu. Hop between conversations without losing context. Fork conversations with different model configurations.
<br>
<br>


### Tree Diagram
```console
.
├── LICENSE
├── README.md
├── docker-compose.yaml
├── dockerfile
├── .env.example
├── package.json
├── screenshots
├── src
│   ├── api-connections
│   │   ├── client.ts
│   │   ├── index.ts
│   │   ├── models.ts
│   │   └── types.ts
│   ├── bot.ts
│   ├── commands
│   │   ├── command-registry.ts
│   │   ├── help-command.ts
│   │   ├── model-command.ts
│   │   ├── optional-params
│   │   │   └── remove.ts
│   │   └── rejoin-conversation.ts
│   ├── managers
│   │   ├── cache
│   │   │   ├── entrypoint.sh
│   │   │   ├── index.ts
│   │   │   ├── manager.ts
│   │   │   ├── store.ts
│   │   │   └── types.ts
│   │   ├── generation
│   │   │   ├── chunk.ts
│   │   │   ├── create.ts
│   │   │   └── preprocessing.ts
│   │   ├── message
│   │   │   └── manager.ts
│   │   └── pages
│   │       └── manager.ts
│   ├── services
│   │   ├── ocr.ts
│   │   └── scraper.ts
│   └── utilities
│       ├── constants.ts
│       ├── index.ts
│       ├── settings.ts
│       └── types.ts
└── tsconfig.json
```

### Dependencies
<details>
<br>
 
1. [**Axios**](https://github.com/axios/axios): Promise based HTTP client for the browser and node.js.
2. [**Discord.js**](https://github.com/discordjs/discord.js): A powerful JavaScript library for interacting with the Discord API.
3. [**dotenv**](https://github.com/motdotla/dotenv): Loads environment variables from .env for nodejs projects.
4. [**tesseract.js**](https://github.com/naptha/tesseract.js): A javascript library that gets words in almost any language out of images.
5. [**jsdom**](https://github.com/jsdom/jsdom): A JavaScript implementation of various web standards, for use with Node.js
6. [**readbility**](https://github.com/mozilla/readability): A standalone version of the readability lib

</details>

### Notes
<details>
<br>

1. Attachments with large amounts of text require a higher `num_ctx` value to work properly.
2. The bot uses OCR to scrape text from screenshots. It does not support multi-modal models currently. 

</details>

### License
This project is licensed under the MIT License.
