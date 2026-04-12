# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Module Overview

**ak-gpt** (v0.0.1) is a modular wrapper around OpenAI's `openai` npm package. It provides 6 class exports for different AI interaction patterns, all extending a shared `BaseGPT` base class.

## Architecture

### File Structure

```
ak-gpt/
  index.js              <- Package entry point: re-exports all classes + helpers
  base.js               <- BaseGPT class (shared logic for all classes)
  transformer.js        <- Transformer class (JSON transformation, few-shot)
  chat.js               <- Chat class (multi-turn text conversation)
  message.js            <- Message class (stateless one-off messages)
  tool-agent.js         <- ToolAgent class (agent with user-provided tools)
  code-agent.js         <- CodeAgent class (agent that writes and executes code)
  rag-agent.js          <- RagAgent class (document Q&A via local files, media files, and in-memory data)
  json-helpers.js       <- Pure functions: extractJSON, attemptJSONRecovery, isJSON, isJSONStr
  logger.js             <- Pino-based logging with configurable levels
  types.d.ts            <- TypeScript definitions for all classes and interfaces
  index.cjs             <- Auto-generated CJS bundle via esbuild
  tests/
    base.test.js        <- Shared base class behavior
    transformer.test.js <- JSON transformation tests
    chat.test.js        <- Multi-turn conversation tests
    message.test.js     <- Stateless message tests
    tool-agent.test.js  <- Agent with user-provided tools tests
    code-agent.test.js  <- CodeAgent tests
    rag-agent.test.js   <- RagAgent tests
    json-helpers.test.js <- Pure function unit tests
```

### Class Hierarchy

All classes extend `BaseGPT` which provides: auth via API key, eager client init via `openai` SDK, manual message history management, reasoning model support, log levels, heuristic token estimation, cost tracking, usage reporting, `seed()`, web search tool, and SDK-level 429 retry (`maxRetries`).

| Class | Base | Primary Method | Description |
|-------|------|---------------|-------------|
| `Transformer` | `BaseGPT` | `send(payload)` | JSON transformation with few-shot, validation, retry |
| `Chat` | `BaseGPT` | `send(message)` | Multi-turn text conversation with history |
| `Message` | `BaseGPT` | `send(payload)` | Stateless one-off messages via `chat.completions.create()` |
| `ToolAgent` | `BaseGPT` | `chat(message)` / `stream(message)` | Agent with user-provided tools |
| `CodeAgent` | `BaseGPT` | `chat(message)` / `stream(message)` | Agent that writes and executes JavaScript |
| `RagAgent` | `BaseGPT` | `chat(message)` / `stream(message)` | Document Q&A via local files, media, and in-memory data |

### Key Design Decisions

- **API-key-only auth** — No Vertex AI, no dual auth. Uses `apiKey` option or `OPENAI_API_KEY` env var. The OpenAI client is created eagerly in the constructor (no lazy `_ensureClient()` needed)
- **Manual history management** — OpenAI's Chat Completions API is stateless; `BaseGPT` maintains `this.history[]` as a plain array and passes the full history on every `chat.completions.create()` call (same pattern as ak-claude)
- **System prompt as message** — System prompt is injected as the first message with `role: 'system'` (unlike Claude which uses a separate `system` parameter)
- **OpenAI tool format auto-mapping** — ToolAgent accepts tools in OpenAI format (`{ type: 'function', function: { name, description, parameters } }`) or Claude/Gemini flat format (`{ name, description, parameters/input_schema/inputSchema/parametersJsonSchema }`), auto-mapping to OpenAI's nested format
- **`web_search_preview` tool** — `enableWebSearch` / `webSearchConfig` adds OpenAI's `web_search_preview` tool type, merged with any user-provided tools via `_buildTools()`
- **Reasoning models via `reasoningEffort`** — o-series models (o3, o4-mini) use `reasoning_effort` + `max_completion_tokens` instead of `max_tokens`/`temperature`/`topP`. Detected via `_isReasoningModel()` which checks `reasoningEffort` option or model name prefix
- **SDK-level retry** — 429 rate-limit retry is handled natively by the `openai` SDK client via `maxRetries` (default: 5), not custom retry logic
- **Native JSON mode / structured output** — Message class supports `responseSchema` (uses `response_format.json_schema` with `strict: true` for guaranteed valid JSON) and fallback `responseFormat: 'json'` (uses `response_format: { type: 'json_object' }`)
- **No Vertex AI** — Unlike ak-claude, there is no Vertex AI integration
- **No prompt caching** — OpenAI does not expose server-managed prompt caching controls
- **No citations** — RagAgent does not have a citation feature
- **No topK** — OpenAI does not support `topK` sampling
- **Heuristic token estimation** — `estimate()` uses ~4 chars/token approximation (OpenAI Node SDK does not expose a token counting API)
- Default export is a namespace object: `{ Transformer, Chat, Message, ToolAgent, CodeAgent, RagAgent }`

## Key Classes & APIs

### BaseGPT (`base.js`)
Shared foundation. Not typically instantiated directly.
- `init(force?)` — Validates connectivity; runs a tiny `chat.completions.create()` health check only if `healthCheck: true`
- `seed(examples, opts?)` — Add example pairs to chat history for few-shot learning
- `getHistory(curated?)` / `clearHistory()` — Manage chat history. `curated: true` returns text-only simplified history
- `getLastUsage()` — Structured usage data after API calls (cumulative across retries)
- `estimate(payload)` / `estimateCost(payload)` — Heuristic token/cost estimation (~4 chars per token)
- `listModels()` — List all available models from the OpenAI API (async iterable)
- `getModel(modelId)` — Get detailed information about a specific model
- `clients` — Namespace exposing raw SDK clients: `clients.openai`, `clients.raw` (both point to the same `openai` client)
- `enableWebSearch` / `webSearchConfig` — OpenAI's `web_search_preview` tool (available on all classes)
- `maxRetries` — SDK-level retry for 429 errors (default: 5), handled by `openai` SDK with exponential backoff
- `healthCheck` — opt-in API connectivity check during `init()` (default: `false`)
- `reasoningEffort` — Reasoning effort for o-series models: `'low'` | `'medium'` | `'high'`

### Transformer (`transformer.js`)
JSON transformation via few-shot learning. Extends BaseGPT.
- `send(payload, opts?, validatorFn?)` — Transform with validation + retry
- `rawSend(payload)` — Direct send, extract JSON
- `rebuild(payload, error)` — AI-powered error correction
- `seed(examples)` — Override with key mapping + file loading (`examplesFile`, `exampleData`)
- `clearHistory()` — Preserves seeded examples
- `reset()` — Full reset including examples
- `updateSystemPrompt(newPrompt)` — Change system prompt
- Supports `stateless` option in `send()` for one-off transforms without affecting history

### Chat (`chat.js`)
Multi-turn text conversation. Extends BaseGPT.
- `send(message, opts?)` -> `{ text, usage }`

### Message (`message.js`)
Stateless one-off messages. Uses `chat.completions.create()` directly. Extends BaseGPT.
- `send(payload, opts?)` -> `{ text, data?, usage }`
- Supports native structured output via `responseSchema` (uses `response_format.json_schema` with `strict: true`)
- Supports fallback JSON mode via `responseFormat: 'json'` (uses `response_format: { type: 'json_object' }` + system prompt augmentation)
- `getHistory()`, `clearHistory()`, `seed()` are no-ops

### ToolAgent (`tool-agent.js`)
Agent with user-provided tools. Extends BaseGPT.
- `chat(message)` -> `{ text, toolCalls, usage }`
- `stream(message)` -> AsyncGenerator yielding `{ type, text?, toolName?, args?, result? }`
- `stop()` — Cancel the agent before the next tool execution round
- Constructor requires: `tools` (ToolDeclaration[]) + `toolExecutor` (async fn)
- Tool format auto-mapping: accepts OpenAI format, Claude format (`input_schema`, `inputSchema`), and Gemini format (`parametersJsonSchema`)
- Tool choice mapping: Claude/Gemini-style (`'auto'`, `'any'`, `'none'`, `{ type: 'tool', name }`) auto-mapped to OpenAI format (`'auto'`, `'required'`, `'none'`, `{ type: 'function', function: { name } }`)
- Optional: `maxToolRounds`, `onToolCall`, `onBeforeExecution`, `toolChoice`, `disableParallelToolUse`, `parallelToolCalls`

### CodeAgent (`code-agent.js`)
Multi-tool coding agent. Extends BaseGPT.
- `chat(message)` -> `{ text, codeExecutions, toolCalls, usage }`
- `stream(message)` -> AsyncGenerator yielding `{ type: 'text'|'code'|'output'|'write'|'fix'|'bash'|'skill'|'done', ... }`
- `stop()` — Cancel the agent and kill any running child process via SIGTERM
- `dump()` — Returns all executed scripts/commands with tool name, filenames, and purposes
- `init()` loads skills, gathers codebase context, builds system prompt
- **6 tools**: `write_code` (output only), `execute_code` (run given code), `write_and_run_code` (autonomous), `fix_code` (structured fix, optional execute), `run_bash` (shell commands), `use_skill` (load skill by name)
- `use_skill` tool only present when `skills` option is set
- `onBeforeExecution(content, toolName)` — callback receives content + tool name (breaking change from `(code)`)
- `toolCalls` array in response tracks all tool invocations; `codeExecutions` kept for backward compat
- Optional: `workingDirectory`, `maxRounds`, `timeout`, `onBeforeExecution`, `onCodeExecution`, `importantFiles`, `writeDir`, `keepArtifacts`, `comments`, `maxRetries`, `skills`, `tools`, `toolExecutor`
- `tools` + `toolExecutor` — add custom tools alongside the built-in 6; dispatched via `toolExecutor(toolName, args)` in the tool loop; stream emits `{ type: 'tool', toolName, args, result, error }`

### RagAgent (`rag-agent.js`)
Document Q&A agent with three context input types. Extends BaseGPT.
- `chat(message)` -> `{ text, usage }`
- `stream(message)` -> AsyncGenerator yielding `{ type: 'text'|'done', text?, fullText?, usage? }`
- `init()` reads local files from disk, encodes images as base64, serializes local data, seeds all into chat history
- `addLocalFiles(paths)` — Add local text files read from disk (triggers reinit)
- `addLocalData(entries)` — Add in-memory data entries (triggers reinit)
- `addMediaFiles(paths)` — Add media files: images encoded as base64 for OpenAI vision (triggers reinit). Note: PDFs are not supported by OpenAI as content blocks and will be skipped.
- `getContext()` — Returns metadata about all context sources: `{ localFiles, localData, mediaFiles }`

## Publishing Checklist

- **When adding new `.js` files**, always add them to the `files` array in `package.json`. This controls what gets published to npm — missing entries cause `ERR_MODULE_NOT_FOUND` for consumers.

## Development Commands

```bash
npm test                   # Run all Jest tests
npm run build:cjs          # Build CommonJS version using esbuild
npm run release            # Version bump and publish to npm
npm run typecheck          # Verify TypeScript definitions
```

## Configuration & Environment

### Environment Variables
- `OPENAI_API_KEY` — OpenAI API key (required)
- `NODE_ENV` — Environment (dev/test/prod affects log levels)
- `LOG_LEVEL` — Override log level (debug/info/warn/error)

### Authentication

```javascript
// API key via constructor
new Transformer({ apiKey: 'your-key' });

// API key via environment variable (OPENAI_API_KEY)
new Transformer(); // auto-detects from env
```

## Module Exports

```javascript
// Named exports
import { Transformer, Chat, Message, ToolAgent, CodeAgent, RagAgent, BaseGPT, log } from 'ak-gpt';
import { extractJSON, attemptJSONRecovery } from 'ak-gpt';

// Default export (namespace object)
import AI from 'ak-gpt';
new AI.Transformer({ ... });

// CommonJS
const { Transformer, Chat } = require('ak-gpt');
```

## Raw SDK Client Access

All `ak-gpt` classes expose the underlying SDK client via the `clients` namespace for advanced use cases:

```javascript
import { Chat } from 'ak-gpt';

const chat = new Chat({ apiKey: process.env.OPENAI_API_KEY });
await chat.init();

// Access raw SDK client
console.log(chat.clients.openai);  // openai SDK client
console.log(chat.clients.raw);     // Same as clients.openai (convenience pointer)

// Use raw client for SDK features not yet wrapped by ak-gpt
const page = await chat.clients.raw.models.list();
for (const model of page.data) {
  console.log(model.id, model.owned_by);
}

// Access completions API directly
const response = await chat.clients.raw.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
  max_tokens: 100
});
```

The `clients` namespace provides:
- `clients.openai` — OpenAI SDK client instance
- `clients.raw` — Convenience pointer (same as `clients.openai`)

The original `client` property remains available for backward compatibility (`client === clients.raw`).

## Model Discovery

All classes inherit model discovery helpers from `BaseGPT`.

### List Available Models

```javascript
import { Chat } from 'ak-gpt';

const chat = new Chat({ apiKey: process.env.OPENAI_API_KEY });

for await (const model of chat.listModels()) {
  console.log(model.id);        // "gpt-4o"
  console.log(model.owned_by);  // "openai"
}
```

### Get Model Details

```javascript
const modelInfo = await chat.getModel('gpt-4o');
console.log(modelInfo);
// { id: "gpt-4o", object: "model", owned_by: "openai", ... }
```

## Testing Strategy

- "No mocks" approach — all tests use real OpenAI API calls
- **Do NOT run tests during development** — they are slow (real API calls) and expensive. Use `npm run typecheck` and `npm run build:cjs` to verify changes.
- Test timeout: 30 seconds (AI calls take 5-15 seconds)
- Rate limiting (429 errors) can cause flaky failures — retry after waiting
- Test model: use `gpt-5-nano` for tests (cheapest, fastest)
- Test files: `base.test.js`, `transformer.test.js`, `chat.test.js`, `message.test.js`, `tool-agent.test.js`, `code-agent.test.js`, `rag-agent.test.js`, `json-helpers.test.js`

## Key Design Patterns

### Few-Shot Learning (Transformer)
Configurable key mappings: `promptKey` (default: 'PROMPT'), `answerKey` (default: 'ANSWER'), `contextKey` (default: 'CONTEXT'), `explanationKey` (default: 'EXPLANATION'). Supports `examplesFile` (path to JSON file) and `exampleData` (inline array) as fallback sources.

### Validation & Self-Healing (Transformer)
- Custom async validator functions that throw on failure
- Automatic retry with exponential backoff (`maxRetries`/`validationRetries`, `retryDelay`)
- AI-powered payload reconstruction via `rebuild()` — sends the bad payload + error message back to GPT for correction
- `_cumulativeUsage` tracks total tokens across all retry attempts

### Multi-Tool Code Agent (CodeAgent)
- **6 tools**: `write_code`, `execute_code`, `write_and_run_code`, `fix_code`, `run_bash`, `use_skill`
- `write_code` — model outputs code without executing (returned as text)
- `execute_code` — run given code (e.g., from a previous write_code call)
- `write_and_run_code` — autonomous: write fresh solution and execute in one step
- `fix_code` — structured fix with original/fixed/explanation; optional `execute: true` to run the fix
- `run_bash` — shell commands via `bash -c`; prefer for simple operations (ls, grep, git, npm)
- `use_skill` — load a skill by name (only present when `skills` option is set)
- `skills: ['./skills/pattern.md']` — paths to markdown skill files loaded during `init()`; skill names from YAML frontmatter or filename
- `onBeforeExecution(content, toolName)` — receives content string + tool name (BREAKING: was `(code)`)
- `toolCalls` array in response: each entry has `tool` discriminator + tool-specific fields
- `codeExecutions` kept for backward compat (filtered from toolCalls)
- Scripts written to `writeDir` (default: `{workingDirectory}/tmp`) as `.mjs` files
- `keepArtifacts: true` preserves scripts on disk; `false` (default) deletes after execution
- `importantFiles` — reads file contents into system prompt; supports partial path matching
- `dump()` returns `[{ fileName, purpose, script, filePath, tool }]` across all executions
- `stop()` kills running child processes via SIGTERM

### Document Q&A (RagAgent)
- Three context input types combined into a single seeded chat history during `init()`:
  - `localFiles` — read from disk as UTF-8 text, seeded as labeled text parts (`--- File: name ---`)
  - `localData` — in-memory objects serialized as JSON, seeded as labeled text parts (`--- Data: name ---`)
  - `mediaFiles` — images encoded as base64, seeded as `image_url` content parts for OpenAI vision. PDFs are not supported.
- `addLocalFiles()`, `addLocalData()`, `addMediaFiles()` each append and call `init(true)` to reinitialize
- No tool loops — simple send/stream pattern like Chat, but with document/data context

### Agent Stop API (ToolAgent + CodeAgent)
- `agent.stop()` — sets `_stopped` flag, breaks loop before next execution
- Can be called from `onBeforeExecution` or `onToolCall` callbacks
- CodeAgent also kills any running child process on stop

### Token Management
- `estimate()` — Heuristic INPUT token estimate before sending (~4 characters per token)
- `getLastUsage()` — Actual consumption AFTER the call (cumulative across retries)
- `estimateCost()` — Cost estimate using `MODEL_PRICING` table in `base.js`
- MODEL_PRICING covers: gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, o3, o3-mini, o4-mini, gpt-5-nano

### Web Search (BaseGPT)
- `enableWebSearch: true` + `webSearchConfig: {}` on any class constructor
- Uses OpenAI's `web_search_preview` tool type
- Web search tool merges with existing tools (ToolAgent/CodeAgent function declarations coexist) via `_buildTools()`

### Reasoning Models (BaseGPT)
- `reasoningEffort: 'low' | 'medium' | 'high'` for o-series models (o3, o4-mini)
- When active, uses `max_completion_tokens` instead of `max_tokens`
- `temperature` and `topP` are not sent for reasoning models
- Auto-detected via model name prefix (`/^o\d/`) or explicit `reasoningEffort` option
