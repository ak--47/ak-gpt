# ak-gpt

**Modular, type-safe wrapper for OpenAI's GPT models.** Six class exports for different interaction patterns --- JSON transformation, chat, stateless messages, tool-using agents, code-writing agents, and document Q&A --- all sharing a common base.

```sh
npm install ak-gpt
```

Requires Node.js 18+ and [openai](https://www.npmjs.com/package/openai).

---

## Quick Start

```javascript
import { Transformer, Chat, Message, ToolAgent, CodeAgent, RagAgent } from 'ak-gpt';

// API key auth
// export OPENAI_API_KEY=your-key
new Chat({ apiKey: 'your-key' });
```

---

## Classes

### Transformer --- JSON Transformation

Transform structured data using few-shot examples with validation and retry.

```javascript
const transformer = new Transformer({
  modelName: 'gpt-4o',
  sourceKey: 'INPUT',
  targetKey: 'OUTPUT'
});

await transformer.init();
await transformer.seed([
  {
    INPUT: { name: 'Alice' },
    OUTPUT: { name: 'Alice', role: 'engineer', emoji: '👩‍💻' }
  }
]);

const result = await transformer.send({ name: 'Bob' });
// → { name: 'Bob', role: '...', emoji: '...' }
```

**Validation & self-healing:**

```javascript
const result = await transformer.send({ name: 'Bob' }, {}, async (output) => {
  if (!output.role) throw new Error('Missing role field');
  return output;
});
```

### Chat --- Multi-Turn Conversation

```javascript
const chat = new Chat({
  systemPrompt: 'You are a helpful assistant.'
});

const r1 = await chat.send('My name is Alice.');
const r2 = await chat.send('What is my name?');
// r2.text → "Alice"
```

### Message --- Stateless One-Off

Each call is independent --- no history maintained.

```javascript
const msg = new Message({
  systemPrompt: 'Extract entities as JSON.',
  responseSchema: {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' }
          },
          required: ['name', 'type']
        }
      }
    },
    required: ['entities']
  }
});

const result = await msg.send('Alice works at Acme Corp in New York.');
// result.data → { entities: [{ name: 'Alice', type: 'person' }, ...] }
```

When `responseSchema` is provided, the API guarantees valid JSON matching the schema via native structured output (`response_format.json_schema`). For a lighter alternative without schema guarantees, use `responseFormat: 'json'` instead.

### ToolAgent --- Agent with User-Provided Tools

Provide tool declarations and an executor function. The agent manages the tool-use loop automatically.

```javascript
const agent = new ToolAgent({
  systemPrompt: 'You are a research assistant.',
  tools: [
    {
      name: 'http_get',
      description: 'Fetch a URL',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url']
      }
    }
  ],
  toolExecutor: async (toolName, args) => {
    if (toolName === 'http_get') {
      const res = await fetch(args.url);
      return { status: res.status, body: await res.text() };
    }
  },
  onBeforeExecution: async (toolName, args) => {
    console.log(`About to call ${toolName}`);
    return true; // return false to deny
  }
});

const result = await agent.chat('Fetch https://api.example.com/data');
console.log(result.text);       // Agent's summary
console.log(result.toolCalls);  // [{ name, args, result }]
```

**Streaming:**

```javascript
for await (const event of agent.stream('Fetch the data')) {
  if (event.type === 'text') process.stdout.write(event.text);
  if (event.type === 'tool_call') console.log(`Calling ${event.toolName}...`);
  if (event.type === 'tool_result') console.log(`Result:`, event.result);
  if (event.type === 'done') console.log('Done!');
}
```

### CodeAgent --- Agent That Writes and Executes Code

Instead of calling tools one by one, the model writes JavaScript that can do everything --- read files, write files, run commands --- in a single script.

```javascript
const agent = new CodeAgent({
  workingDirectory: '/path/to/my/project',
  onCodeExecution: (code, output) => {
    console.log('Ran:', code.slice(0, 100));
    console.log('Output:', output.stdout);
  },
  onBeforeExecution: async (code) => {
    // Review code before execution
    console.log('About to run:', code);
    return true; // return false to deny
  }
});

const result = await agent.chat('Find all TODO comments in the codebase');
console.log(result.text);             // Agent's summary
console.log(result.codeExecutions);   // [{ code, output, stderr, exitCode }]
```

**How it works:**
1. On `init()`, gathers codebase context (file tree + key files like package.json)
2. Injects context into the system prompt so the model understands the project
3. Model writes JavaScript using the `execute_code` tool
4. Code runs in a Node.js child process that inherits `process.env`
5. Output (stdout/stderr) feeds back to the model
6. Model decides if more work is needed

**Streaming:**

```javascript
for await (const event of agent.stream('Refactor the auth module')) {
  if (event.type === 'text') process.stdout.write(event.text);
  if (event.type === 'code') console.log('\n[Running code...]');
  if (event.type === 'output') console.log('[Output]:', event.stdout);
  if (event.type === 'done') console.log('\nDone!');
}
```

### RagAgent --- Document & Data Q&A

Ground responses in user-provided documents and data. Supports text files, in-memory data, and media files (images) via base64 encoding for OpenAI vision.

```javascript
const rag = new RagAgent({
  localFiles: ['./docs/api.md', './config.yaml'],
  localData: [
    { name: 'users', data: [{ id: 1, name: 'Alice' }] }
  ],
  mediaFiles: ['./diagram.png']
});

const result = await rag.chat('What does the API doc say about auth?');
console.log(result.text);
```

**Context input types:**
- **`localFiles`** --- read from disk as UTF-8 text (md, json, csv, yaml, txt, js, py, etc.)
- **`localData`** --- in-memory objects serialized as JSON: `{ name: string, data: any }[]`
- **`mediaFiles`** --- images (png, jpg, gif, webp) encoded as base64 for OpenAI vision

**Note:** PDF files are not natively supported as content blocks by OpenAI and will be skipped.

**Dynamic context:**

```javascript
await rag.addLocalFiles(['./new-doc.md']);
await rag.addMediaFiles(['./chart.png']);
await rag.addLocalData([{ name: 'metrics', data: { dau: 50000 } }]);
```

---

## Stopping Agents

Both `ToolAgent` and `CodeAgent` support a `stop()` method to cancel execution mid-loop. This is useful for implementing user-facing cancel buttons or safety limits.

```javascript
const agent = new CodeAgent({ workingDirectory: '.' });

// Stop from a callback
const agent = new ToolAgent({
  tools: [...],
  toolExecutor: myExecutor,
  onBeforeExecution: async (toolName, args) => {
    if (toolName === 'dangerous_tool') {
      agent.stop(); // Stop the agent entirely
      return false; // Deny this specific execution
    }
    return true;
  }
});

// Stop externally (e.g., from a timeout or user action)
setTimeout(() => agent.stop(), 60_000);
const result = await agent.chat('Do some work');
```

For `CodeAgent`, `stop()` also kills any currently running child process via SIGTERM.

---

## Shared Features

All classes extend `BaseGPT` and share these features.

### Raw SDK Client Access

All classes expose the underlying OpenAI SDK client via the `clients` namespace for advanced use cases:

```javascript
import { Chat } from 'ak-gpt';

const chat = new Chat({ apiKey: process.env.OPENAI_API_KEY });
await chat.init();

// Access raw SDK client
console.log(chat.clients.openai);  // OpenAI SDK client instance
console.log(chat.clients.raw);     // Same as clients.openai

// Use raw client for SDK features not yet wrapped
const completion = await chat.clients.raw.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }]
});
```

### Model Discovery

List and inspect available OpenAI models:

```javascript
import { Chat } from 'ak-gpt';

const chat = new Chat({ apiKey: process.env.OPENAI_API_KEY });

// List all available models
for await (const model of chat.listModels()) {
  console.log(model.id);        // "gpt-4o"
  console.log(model.owned_by);  // "openai"
}

// Get info about a specific model
const modelInfo = await chat.getModel('gpt-4o');
console.log(modelInfo);
```

### Authentication

```javascript
// API key via environment variable
// export OPENAI_API_KEY=your-key
new Chat();

// Explicit API key
new Chat({ apiKey: 'your-key' });
```

### Token Estimation

Uses a character-based heuristic (~4 chars per token) to estimate input token counts before sending.

```javascript
const { inputTokens } = await instance.estimate({ some: 'payload' });
const cost = await instance.estimateCost({ some: 'payload' });
// → { inputTokens, model, pricing, estimatedInputCost, note }
```

### Usage Tracking

```javascript
const usage = instance.getLastUsage();
// { promptTokens, responseTokens, totalTokens,
//   attempts, modelVersion, requestedModel, stopReason, timestamp }
```

### Few-Shot Seeding

```javascript
await instance.seed([
  { PROMPT: { x: 1 }, ANSWER: { y: 2 } }
]);
```

### Reasoning Models (o-series)

```javascript
new Chat({
  modelName: 'o3',
  reasoningEffort: 'high'  // 'low' | 'medium' | 'high'
});
```

When `reasoningEffort` is set (or the model name starts with `o`), `temperature` and `topP` are not sent and `max_completion_tokens` is used instead of `max_tokens`.

### Web Search

Ground responses in real-time web search results. Uses OpenAI's built-in web search preview tool.

```javascript
const chat = new Chat({
  enableWebSearch: true,
  webSearchConfig: {
    // OpenAI web search tool configuration
  }
});

const result = await chat.send('What are the latest GPT model features?');
```

The web search tool is automatically prepended to any existing tools (ToolAgent/CodeAgent tool declarations coexist).

### Rate Limit Handling (429)

The OpenAI SDK handles 429 retries natively via its built-in retry mechanism. Configure the max retry count at construction:

```javascript
// Defaults: 5 retries with SDK-managed exponential backoff
const chat = new Chat({ systemPrompt: 'Hello' });

// Customize
const transformer = new Transformer({
  maxRetries: 10  // more retries for high-throughput pipelines
});

// Disable entirely
const msg = new Message({ maxRetries: 0 });
```

---

## Constructor Options

All classes accept `BaseGPTOptions`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `modelName` | string | `'gpt-4o'` | OpenAI model to use |
| `systemPrompt` | string | varies by class | System prompt |
| `apiKey` | string | env var | OpenAI API key |
| `maxTokens` | number | `8192` | Max tokens in response |
| `temperature` | number | `0.7` | Temperature (not used with reasoning models) |
| `topP` | number | `0.95` | Top-P (not used with reasoning models) |
| `reasoningEffort` | string | --- | `'low'`\|`'medium'`\|`'high'` for o-series models |
| `enableWebSearch` | boolean | `false` | Enable OpenAI's web search tool |
| `webSearchConfig` | object | --- | Web search tool configuration |
| `maxRetries` | number | `5` | Max SDK-level retry attempts for 429 errors |
| `healthCheck` | boolean | `false` | Run API connectivity check during `init()` |
| `logLevel` | string | based on NODE_ENV | `'trace'`\|`'debug'`\|`'info'`\|`'warn'`\|`'error'`\|`'none'` |

### Transformer-Specific

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sourceKey`/`promptKey` | string | `'PROMPT'` | Key for input in examples |
| `targetKey`/`answerKey` | string | `'ANSWER'` | Key for output in examples |
| `contextKey` | string | `'CONTEXT'` | Key for context in examples |
| `maxRetries` | number | `3` | Retry attempts for validation |
| `retryDelay` | number | `1000` | Initial retry delay (ms) |
| `onlyJSON` | boolean | `true` | Enforce JSON-only responses |
| `asyncValidator` | function | --- | Global async validator |
| `examplesFile` | string | --- | Path to JSON file with examples |
| `exampleData` | array | --- | Inline example data |

### Message-Specific

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `responseSchema` | object | --- | JSON Schema for native structured output |
| `responseFormat` | string | --- | `'json'` for system-prompt-based JSON mode |

### ToolAgent-Specific

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tools` | array | --- | Tool declarations (see [GUIDE.md](./GUIDE.md) for all accepted formats) |
| `toolExecutor` | function | --- | `async (toolName, args) => result` |
| `maxToolRounds` | number | `10` | Max tool-use loop iterations |
| `onToolCall` | function | --- | Notification callback when tool is called |
| `onBeforeExecution` | function | --- | `async (toolName, args) => boolean` --- gate execution |
| `toolChoice` | object/string | --- | Tool choice config (`auto`, `any`, `tool`, `none`) |
| `disableParallelToolUse` | boolean | `false` | Force sequential tool calls |
| `parallelToolCalls` | boolean \| number | `true` | Parallel tool execution: `false` = sequential, `true` = unlimited, number = concurrency limit |

### CodeAgent-Specific

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workingDirectory` | string | `process.cwd()` | Directory for code execution |
| `maxRounds` | number | `10` | Max code execution loop iterations |
| `timeout` | number | `30000` | Per-execution timeout (ms) |
| `onBeforeExecution` | function | --- | `async (code) => boolean` --- gate execution |
| `onCodeExecution` | function | --- | Notification after execution |
| `importantFiles` | array | --- | File paths to include in system prompt context |
| `writeDir` | string | `'{cwd}/tmp'` | Directory for writing script files |
| `keepArtifacts` | boolean | `false` | Keep script files on disk after execution |
| `comments` | boolean | `false` | Instruct model to write JSDoc comments |
| `maxRetries` | number | `3` | Max consecutive failures before stopping |

### RagAgent-Specific

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `localFiles` | array | --- | Paths to text files read from disk |
| `localData` | array | --- | In-memory data: `{ name, data }[]` |
| `mediaFiles` | array | --- | Paths to images (base64 encoded for vision) |

---

## Exports

```javascript
// Named exports
import { Transformer, Chat, Message, ToolAgent, CodeAgent, RagAgent, BaseGPT, log } from 'ak-gpt';
import { extractJSON, attemptJSONRecovery } from 'ak-gpt';

// Default export (namespace)
import AI from 'ak-gpt';
new AI.Transformer({ ... });

// CommonJS
const { Transformer, Chat } = require('ak-gpt');
```

---

## Testing

```sh
npm test
```

All tests use real OpenAI API calls (no mocks). Rate limiting (429 errors) can cause intermittent failures.

---

## See Also

- **[GUIDE.md](./GUIDE.md)** --- Comprehensive usage guide with detailed examples for every class
- **[ak-claude](https://github.com/ak--47/ak-claude)** --- Sister package wrapping Anthropic's Claude API with the same API surface
