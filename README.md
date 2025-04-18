# vnc-lm

### A Discord bot for large language models. Add Gemini, Sonnet, GPT, and other models.
 
Easily change models. Edit prompt messages to quickly improve responses. Enable web search. 

<sub>[Supported API providers](https://docs.litellm.ai/docs/providers)</sub>

![Screen Recording 2025-04-18 at 2 00 50 AM](https://github.com/user-attachments/assets/e4b8eb67-091c-4fb9-9a47-0868821153dd)
<br>

### Features
#### Model Management

Load models using the `/model` command. Configure model behavior by adjusting the `system_prompt` (base instructions), `temperature` (response randomness), and `num_ctx` (context length) parameters. The bot is integrated with [ollama](https://github.com/ollama/ollama), which allows users to manage local models right from Discord.

```shell
# model management examples

# loading a model without configuring it
/model model:gemini-exp-2.5-pro
# loading a model with system prompt and temperature
/model model:gemini-exp-2.5-pro system_prompt: You are a helpful assistant. temperature: 0.4
# loading an ollama model with num_ctx
/model model:command-a:111b num_ctx:32000
# downloading an ollama model by sending a model tag link
https://ollama.com/library/command-a:111b
# removing an ollama model
/model model:command-a:111b remove:True
```

A thread will be created once the model loads. To switch models within a thread, send `+` followed by any distinctive part of the model name.

```shell
# model switching examples

# switch to gpt-4.1
+ gpt, + 4.1
# switch to gemini-exp-2.5-pro
+ gemini, + exp, + 2.5
# switch to claude-sonnet-3.7
+ claude, + sonnet, + 3.7

# turn on web search
+ search
# turn off web search
+ model
```

The bot is integrated with [LiteLLM](https://www.litellm.ai/), which provides a unified interface to access leading large language model APIs. This integration also supports OpenAI-compatible APIs, enabling support for open-source LLM projects. Add new models by editing `litellm_config.yaml` in the `vnc-lm/` directory. While LiteLLM starts automatically with the Docker container, the bot can also run with ollama alone if preferred.

#### Web Search

After being enabled with `+ search`, the bot will use a RAG pipeline to gather additional context from multiple sources: [Wikipedia](https://www.wikipedia.org/) articles, web search results, and news sources. The context gathered will then be passed to a vector store and analyzed for relevance using a hybrid approach that combines vector similarity and keyword matching. The system prioritizes relevant and recent information, with special emphasis on time-sensitive queries. The bot will pull the most relevant content chunks and add around tokens of context to the user query, delivering highly targeted information while maintaining efficiency. This context represents just a small percentage of the total information gathered during search. Web search can be turned off with `+ model`.

#### Message Handling 

Messages are automatically paginated and support text files, links, and images (via multi-modal models or OCR based on `.env` settings). Edit prompts to refine responses, with conversations persisting across container restarts in `bot_cache.json`. Create conversation branches by replying `branch` to any message. Hop between different conversation paths while maintaining separate histories.

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

```shell
# configure the below .env fields

# Discord bot token
TOKEN=
# administrator Discord user id (necessary for model downloading / removal privileges)
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

<img width="1132" alt="image" src="https://github.com/user-attachments/assets/8ae065ea-da37-43da-9734-6858605c9c9b" />

<sub>Successful build</sub>

> [!NOTE]  
> Send `/help` for instructions on how to use the bot.

### Dependencies
<details>
<br>
 
```shell
{
  "dependencies": {
"dependencies": {
   "@mozilla/readability": "^0.5.0",  # Library for extracting readable content from web pages
   "axios": "^1.7.2",                 # HTTP client for making API requests
   "discord.js": "^14.15.3",          # Discord API wrapper for building Discord bots
   "dotenv": "^16.4.5",               # Loads environment variables from .env files
   "jsdom": "^24.1.3",                # DOM implementation for parsing HTML in Node.js
   "keyword-extractor": "^0.0.27",    # Extracts keywords from text for generating thread names
   "puppeteer": "^21.7.0",            # Headless browser automation for web scraping
   "sharp": "^0.33.5",                # Image processing library for resizing/optimizing images  
   "tesseract.js": "^5.1.0",          # Optical Character Recognition (OCR) for extracting text from images
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
# Discord api error examples
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
