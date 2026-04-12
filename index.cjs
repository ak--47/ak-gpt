var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// index.js
var index_exports = {};
__export(index_exports, {
  BaseGPT: () => base_default,
  Chat: () => chat_default,
  CodeAgent: () => code_agent_default,
  Message: () => message_default,
  RagAgent: () => rag_agent_default,
  ToolAgent: () => tool_agent_default,
  Transformer: () => transformer_default,
  attemptJSONRecovery: () => attemptJSONRecovery,
  default: () => index_default,
  extractJSON: () => extractJSON,
  log: () => logger_default
});
module.exports = __toCommonJS(index_exports);

// base.js
var import_dotenv = __toESM(require("dotenv"), 1);
var import_openai = __toESM(require("openai"), 1);

// logger.js
var import_pino = __toESM(require("pino"), 1);
var isDev = process.env.NODE_ENV !== "production";
var logger = (0, import_pino.default)({
  level: process.env.LOG_LEVEL || "info",
  // Supports 'fatal', 'error', 'warn', 'info', 'debug', 'trace'
  messageKey: "message",
  // GCP expects 'message' instead of Pino's default 'msg'
  transport: isDev ? {
    target: "pino-pretty",
    // Prettified output for local dev
    options: { colorize: true, translateTime: true }
  } : void 0
  // In prod/cloud, keep as JSON for cloud logging
});
var logger_default = logger;

// json-helpers.js
function isJSON(data) {
  try {
    const attempt = JSON.stringify(data);
    if (attempt?.startsWith("{") || attempt?.startsWith("[")) {
      if (attempt?.endsWith("}") || attempt?.endsWith("]")) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}
function isJSONStr(string) {
  if (typeof string !== "string") return false;
  try {
    const result = JSON.parse(string);
    const type = Object.prototype.toString.call(result);
    return type === "[object Object]" || type === "[object Array]";
  } catch (err) {
    return false;
  }
}
function attemptJSONRecovery(text, maxAttempts = 100) {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch (e) {
  }
  let workingText = text.trim();
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escapeNext = false;
  for (let j = 0; j < workingText.length; j++) {
    const char = workingText[j];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") braces++;
      else if (char === "}") braces--;
      else if (char === "[") brackets++;
      else if (char === "]") brackets--;
    }
  }
  if ((braces > 0 || brackets > 0 || inString) && workingText.length > 2) {
    let fixedText = workingText;
    if (inString) {
      fixedText += '"';
    }
    while (braces > 0) {
      fixedText += "}";
      braces--;
    }
    while (brackets > 0) {
      fixedText += "]";
      brackets--;
    }
    try {
      const result = JSON.parse(fixedText);
      if (logger_default.level !== "silent") {
        logger_default.warn(`JSON response appears truncated (possibly hit maxTokens limit). Recovered by adding closing characters.`);
      }
      return result;
    } catch (e) {
    }
  }
  for (let i = 0; i < maxAttempts && workingText.length > 2; i++) {
    workingText = workingText.slice(0, -1);
    let braces2 = 0;
    let brackets2 = 0;
    let inString2 = false;
    let escapeNext2 = false;
    for (let j = 0; j < workingText.length; j++) {
      const char = workingText[j];
      if (escapeNext2) {
        escapeNext2 = false;
        continue;
      }
      if (char === "\\") {
        escapeNext2 = true;
        continue;
      }
      if (char === '"') {
        inString2 = !inString2;
        continue;
      }
      if (!inString2) {
        if (char === "{") braces2++;
        else if (char === "}") braces2--;
        else if (char === "[") brackets2++;
        else if (char === "]") brackets2--;
      }
    }
    if (braces2 === 0 && brackets2 === 0 && !inString2) {
      try {
        const result = JSON.parse(workingText);
        if (logger_default.level !== "silent") {
          logger_default.warn(`JSON response appears truncated (possibly hit maxTokens limit). Recovered by removing ${i + 1} characters from the end.`);
        }
        return result;
      } catch (e) {
      }
    }
    if (i > 5) {
      let fixedText = workingText;
      if (inString2) {
        fixedText += '"';
      }
      while (braces2 > 0) {
        fixedText += "}";
        braces2--;
      }
      while (brackets2 > 0) {
        fixedText += "]";
        brackets2--;
      }
      try {
        const result = JSON.parse(fixedText);
        if (logger_default.level !== "silent") {
          logger_default.warn(`JSON response appears truncated (possibly hit maxTokens limit). Recovered by adding closing characters.`);
        }
        return result;
      } catch (e) {
      }
    }
  }
  return null;
}
function extractCompleteStructure(text, startPos) {
  const startChar = text[startPos];
  const endChar = startChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startPos; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (char === '"' && !escaped) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === startChar) {
        depth++;
      } else if (char === endChar) {
        depth--;
        if (depth === 0) {
          return text.substring(startPos, i + 1);
        }
      }
    }
  }
  return null;
}
function findCompleteJSONStructures(text) {
  const results = [];
  const startChars = ["{", "["];
  for (let i = 0; i < text.length; i++) {
    if (startChars.includes(text[i])) {
      const extracted = extractCompleteStructure(text, i);
      if (extracted) {
        results.push(extracted);
      }
    }
  }
  return results;
}
function extractJSON(text) {
  if (!text || typeof text !== "string") {
    throw new Error("No text provided for JSON extraction");
  }
  if (isJSONStr(text.trim())) {
    return JSON.parse(text.trim());
  }
  const codeBlockPatterns = [
    /```json\s*\n?([\s\S]*?)\n?\s*```/gi,
    /```\s*\n?([\s\S]*?)\n?\s*```/gi
  ];
  for (const pattern of codeBlockPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const jsonContent = match.replace(/```json\s*\n?/gi, "").replace(/```\s*\n?/gi, "").trim();
        if (isJSONStr(jsonContent)) {
          return JSON.parse(jsonContent);
        }
      }
    }
  }
  const jsonPatterns = [
    /\{[\s\S]*\}/g,
    /\[[\s\S]*\]/g
  ];
  for (const pattern of jsonPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const candidate = match.trim();
        if (isJSONStr(candidate)) {
          return JSON.parse(candidate);
        }
      }
    }
  }
  const advancedExtract = findCompleteJSONStructures(text);
  if (advancedExtract.length > 0) {
    for (const candidate of advancedExtract) {
      if (isJSONStr(candidate)) {
        return JSON.parse(candidate);
      }
    }
  }
  const cleanedText = text.replace(/^\s*Sure,?\s*here\s+is\s+your?\s+.*?[:\n]/gi, "").replace(/^\s*Here\s+is\s+the\s+.*?[:\n]/gi, "").replace(/^\s*The\s+.*?is\s*[:\n]/gi, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").trim();
  if (isJSONStr(cleanedText)) {
    return JSON.parse(cleanedText);
  }
  const recoveredJSON = attemptJSONRecovery(text);
  if (recoveredJSON !== null) {
    return recoveredJSON;
  }
  throw new Error(`Could not extract valid JSON from model response. Response preview: ${text.substring(0, 200)}...`);
}

// base.js
import_dotenv.default.config({ quiet: true });
var { NODE_ENV = "unknown", LOG_LEVEL = "" } = process.env;
var DEFAULT_MAX_TOKENS = 8192;
var MODEL_PRICING = {
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o3": { input: 10, output: 40 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "o4-mini": { input: 1.1, output: 4.4 },
  "gpt-5-nano": { input: 0.1, output: 0.4 }
};
var BaseGPT = class {
  /**
   * @param {BaseGPTOptions} [options={}]
   */
  constructor(options = {}) {
    this.modelName = options.modelName || "gpt-4o";
    if (options.systemPrompt !== void 0) {
      this.systemPrompt = options.systemPrompt;
    } else {
      this.systemPrompt = null;
    }
    this.apiKey = options.apiKey !== void 0 && options.apiKey !== null ? options.apiKey : process.env.OPENAI_API_KEY;
    if (!this.apiKey) {
      throw new Error("Missing OpenAI API key. Provide via options.apiKey or OPENAI_API_KEY env var.");
    }
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.temperature = options.temperature ?? 0.7;
    this.topP = options.topP ?? 0.95;
    this.reasoningEffort = options.reasoningEffort ?? void 0;
    this.enableWebSearch = options.enableWebSearch ?? false;
    this.webSearchConfig = options.webSearchConfig ?? {};
    this.healthCheck = options.healthCheck ?? false;
    this.maxRetries = options.maxRetries ?? 5;
    this._configureLogLevel(options.logLevel);
    this.client = new import_openai.default({
      apiKey: this.apiKey,
      maxRetries: this.maxRetries
    });
    this.clients = {
      openai: this.client,
      raw: this.client
    };
    this.history = [];
    this.lastResponseMetadata = null;
    this.exampleCount = 0;
    this._initialized = false;
    this._cumulativeUsage = {
      promptTokens: 0,
      responseTokens: 0,
      totalTokens: 0,
      attempts: 0
    };
    logger_default.debug(`${this.constructor.name} created with model: ${this.modelName}`);
  }
  // ── Client Management ───────────────────────────────────────────────────
  /**
   * Ensures the OpenAI client is ready. No-op for BaseGPT since the client
   * is created eagerly in the constructor.
   * Called by subclasses (CodeAgent, RagAgent) during init().
   * @returns {Promise<void>}
   * @protected
   */
  async _ensureClient() {
  }
  // ── Initialization ───────────────────────────────────────────────────────
  /**
   * Initializes the instance. Idempotent unless force=true.
   * OpenAI has no chat sessions to create — this just validates connectivity.
   * @param {boolean} [force=false]
   * @returns {Promise<void>}
   */
  async init(force = false) {
    if (this._initialized && !force) return;
    logger_default.debug(`Initializing ${this.constructor.name} with model: ${this.modelName}...`);
    if (this.healthCheck) {
      try {
        await this.client.chat.completions.create({
          model: this.modelName,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }]
        });
        logger_default.debug(`${this.constructor.name}: API connection successful.`);
      } catch (e) {
        throw new Error(`${this.constructor.name} initialization failed: ${e.message}`);
      }
    }
    this._initialized = true;
    logger_default.debug(`${this.constructor.name}: Initialized.`);
  }
  // ── Core Message Sending ─────────────────────────────────────────────────
  /**
   * Builds the system message(s) to prepend to the messages array.
   * OpenAI includes the system prompt as the first message with role: 'system'.
   * @returns {Array<Object>} Array containing the system message, or empty array
   * @protected
   */
  _buildSystemMessages() {
    if (!this.systemPrompt) return [];
    return [{ role: "system", content: this.systemPrompt }];
  }
  /**
   * Builds the tools array, prepending the web search tool if enabled.
   * @param {Array} [tools] - User-provided tools array
   * @returns {Array|undefined} The final tools array, or undefined if empty
   * @protected
   */
  _buildTools(tools) {
    if (!this.enableWebSearch && !tools) return void 0;
    if (!this.enableWebSearch) return tools;
    const webSearchTool = {
      type: "web_search_preview",
      ...this.webSearchConfig
    };
    if (!tools || tools.length === 0) return [webSearchTool];
    return [webSearchTool, ...tools];
  }
  /**
   * Detects whether the current model is a reasoning model (o-series).
   * Reasoning models have different parameter requirements.
   * @returns {boolean}
   * @protected
   */
  _isReasoningModel() {
    return this.reasoningEffort !== void 0 || /^o\d/.test(this.modelName);
  }
  /**
   * Core method: sends a message via chat.completions.create(), manages history.
   * Handles both string content and arrays of tool result messages.
   *
   * When userContent is a string, it is pushed as a single user message.
   * When userContent is an array of { role: 'tool', tool_call_id, content } messages,
   * each is pushed individually to history (OpenAI tool results are top-level messages).
   *
   * @param {string|Array} userContent - String message or array of tool result messages
   * @param {Object} [opts={}] - Additional params (tools, tool_choice, maxTokens, etc.)
   * @returns {Promise<Object>} The API response
   * @protected
   */
  async _sendMessage(userContent, opts = {}) {
    if (!this._initialized) await this.init();
    if (Array.isArray(userContent)) {
      for (const msg of userContent) {
        this.history.push(msg);
      }
    } else {
      this.history.push({ role: "user", content: userContent });
    }
    const tools = this._buildTools(opts.tools);
    const params = {
      model: opts.model || this.modelName,
      messages: [...this._buildSystemMessages(), ...this.history],
      ...tools && { tools },
      ...opts.tool_choice && { tool_choice: opts.tool_choice }
    };
    if (this._isReasoningModel()) {
      params.max_completion_tokens = opts.maxTokens || this.maxTokens;
      if (this.reasoningEffort) {
        params.reasoning_effort = this.reasoningEffort;
      }
    } else {
      params.max_tokens = opts.maxTokens || this.maxTokens;
      if (this.temperature !== void 0) params.temperature = this.temperature;
      if (this.topP !== void 0) params.top_p = this.topP;
    }
    const response = await this.client.chat.completions.create(params);
    this.history.push(response.choices[0].message);
    this._captureMetadata(response);
    return response;
  }
  /**
   * Streaming variant of _sendMessage. Returns the async iterable stream.
   *
   * @param {string|Array} userContent - String message or array of tool result messages
   * @param {Object} [opts={}] - Additional params
   * @returns {Promise<Object>} The async iterable stream from the OpenAI SDK
   * @protected
   */
  async _streamMessage(userContent, opts = {}) {
    if (!this._initialized) await this.init();
    if (Array.isArray(userContent)) {
      for (const msg of userContent) {
        this.history.push(msg);
      }
    } else {
      this.history.push({ role: "user", content: userContent });
    }
    const tools = this._buildTools(opts.tools);
    const params = {
      model: opts.model || this.modelName,
      messages: [...this._buildSystemMessages(), ...this.history],
      stream: true,
      stream_options: { include_usage: true },
      ...tools && { tools },
      ...opts.tool_choice && { tool_choice: opts.tool_choice }
    };
    if (this._isReasoningModel()) {
      params.max_completion_tokens = opts.maxTokens || this.maxTokens;
      if (this.reasoningEffort) {
        params.reasoning_effort = this.reasoningEffort;
      }
    } else {
      params.max_tokens = opts.maxTokens || this.maxTokens;
      if (this.temperature !== void 0) params.temperature = this.temperature;
      if (this.topP !== void 0) params.top_p = this.topP;
    }
    const stream = await this.client.chat.completions.create(params);
    return stream;
  }
  // ── Text Extraction ──────────────────────────────────────────────────────
  /**
   * Extracts text from an OpenAI chat completion response.
   * @param {Object} response - The API response
   * @returns {string}
   * @protected
   */
  _extractText(response) {
    if (!response?.choices?.[0]?.message) return "";
    return response.choices[0].message.content || "";
  }
  // ── History Management ───────────────────────────────────────────────────
  /**
   * Retrieves the current conversation history.
   * @param {boolean} [curated=false] - If true, returns text-only simplified history
   * @returns {Array<Object>}
   */
  getHistory(curated = false) {
    if (curated) {
      return this.history.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : String(m.content || "")
      }));
    }
    return [...this.history];
  }
  /**
   * Clears conversation history.
   * Subclasses may override to preserve seeded examples.
   * @returns {Promise<void>}
   */
  async clearHistory() {
    this.history = [];
    this.lastResponseMetadata = null;
    this._cumulativeUsage = { promptTokens: 0, responseTokens: 0, totalTokens: 0, attempts: 0 };
    logger_default.debug(`${this.constructor.name}: Conversation history cleared.`);
  }
  // ── Few-Shot Seeding ─────────────────────────────────────────────────────
  /**
   * Seeds the conversation with example input/output pairs for few-shot learning.
   * Injects user/assistant message pairs into history.
   *
   * @param {TransformationExample[]} examples - Array of example objects
   * @param {Object} [opts={}] - Key configuration
   * @param {string} [opts.promptKey='PROMPT'] - Key for input data
   * @param {string} [opts.answerKey='ANSWER'] - Key for output data
   * @param {string} [opts.contextKey='CONTEXT'] - Key for optional context
   * @param {string} [opts.explanationKey='EXPLANATION'] - Key for optional explanations
   * @param {string} [opts.systemPromptKey='SYSTEM'] - Key for system prompt overrides
   * @returns {Promise<Array>} The updated history
   */
  async seed(examples, opts = {}) {
    await this.init();
    if (!examples || !Array.isArray(examples) || examples.length === 0) {
      logger_default.debug("No examples provided. Skipping seeding.");
      return this.getHistory();
    }
    const promptKey = opts.promptKey || "PROMPT";
    const answerKey = opts.answerKey || "ANSWER";
    const contextKey = opts.contextKey || "CONTEXT";
    const explanationKey = opts.explanationKey || "EXPLANATION";
    const systemPromptKey = opts.systemPromptKey || "SYSTEM";
    const instructionExample = examples.find((ex) => ex[systemPromptKey]);
    if (instructionExample) {
      logger_default.debug(`Found system prompt in examples; updating.`);
      this.systemPrompt = instructionExample[systemPromptKey];
    }
    logger_default.debug(`Seeding conversation with ${examples.length} examples...`);
    const historyToAdd = [];
    for (const example of examples) {
      const contextValue = example[contextKey] || "";
      const promptValue = example[promptKey] || "";
      const answerValue = example[answerKey] || "";
      const explanationValue = example[explanationKey] || "";
      let userText = "";
      let modelResponse = {};
      if (contextValue) {
        let contextText = isJSON(contextValue) ? JSON.stringify(contextValue, null, 2) : contextValue;
        userText += `CONTEXT:
${contextText}

`;
      }
      if (promptValue) {
        let promptText = isJSON(promptValue) ? JSON.stringify(promptValue, null, 2) : promptValue;
        userText += promptText;
      }
      if (answerValue) modelResponse.data = answerValue;
      if (explanationValue) modelResponse.explanation = explanationValue;
      const modelText = JSON.stringify(modelResponse, null, 2);
      if (userText.trim().length && modelText.trim().length > 0) {
        historyToAdd.push({ role: "user", content: userText.trim() });
        historyToAdd.push({ role: "assistant", content: modelText.trim() });
      }
    }
    logger_default.debug(`Adding ${historyToAdd.length} items to history (${this.history.length} existing)...`);
    this.history = [...this.history, ...historyToAdd];
    this.exampleCount = this.history.length;
    logger_default.debug(`History now has ${this.history.length} items.`);
    return this.getHistory();
  }
  // ── Response Metadata ────────────────────────────────────────────────────
  /**
   * Captures response metadata from an API response.
   * @param {Object} response - The API response object
   * @protected
   */
  _captureMetadata(response) {
    this.lastResponseMetadata = {
      modelVersion: response.model || null,
      requestedModel: this.modelName,
      promptTokens: response.usage?.prompt_tokens || 0,
      responseTokens: response.usage?.completion_tokens || 0,
      totalTokens: (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0),
      stopReason: response.choices?.[0]?.finish_reason || null,
      timestamp: Date.now()
    };
  }
  /**
   * Returns structured usage data from the last API call.
   * Includes CUMULATIVE token counts across all retry attempts.
   * @returns {UsageData|null}
   */
  getLastUsage() {
    if (!this.lastResponseMetadata) return null;
    const meta = this.lastResponseMetadata;
    const cumulative = this._cumulativeUsage || { promptTokens: 0, responseTokens: 0, totalTokens: 0, attempts: 1 };
    const useCumulative = cumulative.attempts > 0;
    return {
      promptTokens: useCumulative ? cumulative.promptTokens : meta.promptTokens,
      responseTokens: useCumulative ? cumulative.responseTokens : meta.responseTokens,
      totalTokens: useCumulative ? cumulative.totalTokens : meta.totalTokens,
      attempts: useCumulative ? cumulative.attempts : 1,
      modelVersion: meta.modelVersion,
      requestedModel: meta.requestedModel,
      stopReason: meta.stopReason,
      timestamp: meta.timestamp
    };
  }
  // ── Token Estimation ────────────────────────────────────────────────────
  /**
   * Estimates INPUT token count for a payload before sending.
   * Includes system prompt + chat history + your new message.
   * Uses a character-based heuristic (OpenAI does not expose a token counting API
   * in the Node SDK). Approximation: ~4 characters per token.
   * @param {Object|string} nextPayload - The next message to estimate
   * @returns {Promise<{ inputTokens: number }>}
   */
  async estimate(nextPayload) {
    if (!this._initialized) await this.init();
    const nextMessage = typeof nextPayload === "string" ? nextPayload : JSON.stringify(nextPayload, null, 2);
    let allContent = "";
    if (this.systemPrompt) {
      allContent += this.systemPrompt;
    }
    for (const msg of this.history) {
      if (typeof msg.content === "string") {
        allContent += msg.content;
      } else if (msg.content) {
        allContent += JSON.stringify(msg.content);
      }
    }
    allContent += nextMessage;
    const inputTokens = Math.ceil(allContent.length / 4);
    return { inputTokens };
  }
  /**
   * Estimates the INPUT cost of sending a payload based on model pricing.
   * @param {Object|string} nextPayload - The next message to estimate
   * @returns {Promise<{ inputTokens: number, model: string, pricing: { input: number, output: number }, estimatedInputCost: number, note: string }>}
   */
  async estimateCost(nextPayload) {
    const tokenInfo = await this.estimate(nextPayload);
    const pricing = MODEL_PRICING[this.modelName] || { input: 0, output: 0 };
    return {
      inputTokens: tokenInfo.inputTokens,
      model: this.modelName,
      pricing,
      estimatedInputCost: tokenInfo.inputTokens / 1e6 * pricing.input,
      note: "Cost is for input tokens only (heuristic estimate); output cost depends on response length"
    };
  }
  // ── Model Management ─────────────────────────────────────────────────────
  /**
   * Lists all available models from the OpenAI API.
   * Returns an async iterable of model objects.
   *
   * @returns {AsyncIterable<Object>} AsyncIterable of model objects
   * @example
   * const chat = new Chat({ apiKey: 'your-key' });
   * for await (const model of chat.listModels()) {
   *   console.log(model.id, model.owned_by);
   * }
   */
  async *listModels() {
    const page = await this.client.models.list();
    for (const model of page.data) {
      yield model;
    }
  }
  /**
   * Retrieves detailed information about a specific model.
   * @param {string} modelId - The model ID (e.g., 'gpt-4o')
   * @returns {Promise<Object>} The model details
   * @example
   * const chat = new Chat({ apiKey: 'your-key' });
   * const modelInfo = await chat.getModel('gpt-4o');
   * console.log(modelInfo);
   */
  async getModel(modelId) {
    return await this.client.models.retrieve(modelId);
  }
  // ── Application-Level Retry ──────────────────────────────────────────────
  /**
   * Wraps an async function with retry logic.
   * Note: The OpenAI SDK handles 429s natively via maxRetries.
   * This is for application-level retries (e.g., Transformer self-healing).
   * @param {() => Promise<T>} fn - The async function to execute
   * @returns {Promise<T>}
   * @template T
   * @protected
   */
  async _withRetry(fn) {
    return await fn();
  }
  // ── Private Helpers ──────────────────────────────────────────────────────
  /**
   * Configures the log level based on options, env vars, or NODE_ENV.
   * @param {string} [logLevel]
   * @private
   */
  _configureLogLevel(logLevel) {
    if (logLevel) {
      if (logLevel === "none") {
        logger_default.level = "silent";
      } else {
        logger_default.level = logLevel;
      }
    } else if (LOG_LEVEL) {
      logger_default.level = LOG_LEVEL;
    } else if (NODE_ENV === "dev") {
      logger_default.level = "debug";
    } else if (NODE_ENV === "test") {
      logger_default.level = "warn";
    } else if (NODE_ENV.startsWith("prod")) {
      logger_default.level = "error";
    } else {
      logger_default.level = "info";
    }
  }
};
var base_default = BaseGPT;

// transformer.js
var import_promises = __toESM(require("fs/promises"), 1);
var import_path = __toESM(require("path"), 1);
var DEFAULT_SYSTEM_INSTRUCTIONS = `
You are an expert JSON transformation engine. Your task is to accurately convert data payloads from one format to another.

You will be provided with example transformations (Source JSON -> Target JSON).

Learn the mapping rules from these examples.

When presented with new Source JSON, apply the learned transformation rules to produce a new Target JSON payload.

Always respond ONLY with a valid JSON object that strictly adheres to the expected output format.

Do not include any additional text, explanations, or formatting before or after the JSON object.

Do not wrap your response in markdown code blocks.
`;
var Transformer = class extends base_default {
  /**
   * @param {TransformerOptions} [options={}]
   */
  constructor(options = {}) {
    if (options.systemPrompt === void 0) {
      options = { ...options, systemPrompt: DEFAULT_SYSTEM_INSTRUCTIONS };
    }
    super(options);
    this.onlyJSON = options.onlyJSON !== void 0 ? options.onlyJSON : true;
    this.promptKey = options.promptKey || options.sourceKey || "PROMPT";
    this.answerKey = options.answerKey || options.targetKey || "ANSWER";
    this.contextKey = options.contextKey || "CONTEXT";
    this.explanationKey = options.explanationKey || "EXPLANATION";
    this.systemPromptKey = options.systemPromptKey || "SYSTEM";
    if (this.promptKey === this.answerKey) {
      throw new Error("Source and target keys cannot be the same. Please provide distinct keys.");
    }
    this.examplesFile = options.examplesFile || null;
    this.exampleData = options.exampleData || null;
    this.asyncValidator = options.asyncValidator || null;
    this.validationRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1e3;
    logger_default.debug(`Transformer keys \u2014 Source: "${this.promptKey}", Target: "${this.answerKey}", Context: "${this.contextKey}"`);
  }
  // ── Seeding ──────────────────────────────────────────────────────────────
  /**
   * Seeds the conversation with transformation examples using the configured key mapping.
   * Overrides base seed() to use Transformer-specific keys and support
   * examplesFile/exampleData fallbacks.
   *
   * @param {TransformationExample[]} [examples] - Array of example objects
   * @returns {Promise<Array>} The updated history
   */
  async seed(examples) {
    await this.init();
    if (!examples || !Array.isArray(examples) || examples.length === 0) {
      if (this.examplesFile) {
        logger_default.debug(`No examples provided, loading from file: ${this.examplesFile}`);
        try {
          const filePath = import_path.default.resolve(this.examplesFile);
          const raw = await import_promises.default.readFile(filePath, "utf-8");
          examples = JSON.parse(raw);
        } catch (err) {
          throw new Error(`Could not load examples from file: ${this.examplesFile}. ${err.message}`);
        }
      } else if (this.exampleData) {
        logger_default.debug(`Using example data provided in options.`);
        if (Array.isArray(this.exampleData)) {
          examples = this.exampleData;
        } else {
          throw new Error(`Invalid example data provided. Expected an array of examples.`);
        }
      } else {
        logger_default.debug("No examples provided and no examples file specified. Skipping seeding.");
        return this.getHistory();
      }
    }
    return await super.seed(examples, {
      promptKey: this.promptKey,
      answerKey: this.answerKey,
      contextKey: this.contextKey,
      explanationKey: this.explanationKey,
      systemPromptKey: this.systemPromptKey
    });
  }
  // ── Primary Send Method ──────────────────────────────────────────────────
  /**
   * Transforms a payload using the seeded examples and model.
   * Includes validation and automatic retry with AI-powered error correction.
   *
   * @param {Object|string} payload - The source payload to transform
   * @param {Object} [opts={}] - Per-message options
   * @param {AsyncValidatorFunction|null} [validatorFn] - Validator for this call (overrides constructor validator)
   * @returns {Promise<Object>} The transformed payload
   */
  async send(payload, opts = {}, validatorFn = null) {
    if (!this._initialized) await this.init();
    const validator = validatorFn || this.asyncValidator;
    if (opts.stateless) {
      return await this._statelessSend(payload, opts, validator);
    }
    const maxRetries = opts.maxRetries ?? this.validationRetries;
    const retryDelay = opts.retryDelay ?? this.retryDelay;
    let lastPayload = this._preparePayload(payload);
    this._cumulativeUsage = { promptTokens: 0, responseTokens: 0, totalTokens: 0, attempts: 0 };
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const transformedPayload = attempt === 0 ? await this.rawSend(lastPayload) : await this.rebuild(lastPayload, lastError.message);
        if (this.lastResponseMetadata) {
          this._cumulativeUsage.promptTokens += this.lastResponseMetadata.promptTokens || 0;
          this._cumulativeUsage.responseTokens += this.lastResponseMetadata.responseTokens || 0;
          this._cumulativeUsage.totalTokens += this.lastResponseMetadata.totalTokens || 0;
          this._cumulativeUsage.attempts = attempt + 1;
        }
        lastPayload = transformedPayload;
        if (validator) {
          await validator(transformedPayload);
        }
        logger_default.debug(`Transformation succeeded on attempt ${attempt + 1}`);
        return transformedPayload;
      } catch (error) {
        lastError = error;
        logger_default.warn(`Attempt ${attempt + 1} failed: ${error.message}`);
        if (attempt >= maxRetries) {
          logger_default.error(`All ${maxRetries + 1} attempts failed.`);
          throw new Error(`Transformation failed after ${maxRetries + 1} attempts. Last error: ${error.message}`);
        }
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  // ── Raw Send ─────────────────────────────────────────────────────────────
  /**
   * Sends a single prompt to the model and parses the JSON response.
   * No validation or retry logic.
   *
   * @param {Object|string} payload - The source payload
   * @returns {Promise<Object>} The transformed payload
   */
  async rawSend(payload) {
    if (!this._initialized) await this.init();
    const actualPayload = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    try {
      const response = await this._sendMessage(actualPayload);
      const modelResponse = this._extractText(response);
      if (response.usage && logger_default.level !== "silent") {
        logger_default.debug(`API response: model=${response.model || "unknown"}, tokens=${response.usage.prompt_tokens + response.usage.completion_tokens}`);
      }
      const extractedJSON = extractJSON(modelResponse);
      if (extractedJSON?.data) {
        return extractedJSON.data;
      }
      return extractedJSON;
    } catch (error) {
      if (this.onlyJSON && error.message.includes("Could not extract valid JSON")) {
        throw new Error(`Invalid JSON response from GPT: ${error.message}`);
      }
      throw new Error(`Transformation failed: ${error.message}`);
    }
  }
  // ── Rebuild ──────────────────────────────────────────────────────────────
  /**
   * Asks the model to fix a payload that failed validation.
   *
   * @param {Object} lastPayload - The payload that failed
   * @param {string} serverError - The error message
   * @returns {Promise<Object>} Corrected payload
   */
  async rebuild(lastPayload, serverError) {
    await this.init();
    const prompt = `
The previous JSON payload (below) failed validation.
The server's error message is quoted afterward.

---------------- BAD PAYLOAD ----------------
${JSON.stringify(lastPayload, null, 2)}


---------------- SERVER ERROR ----------------
${serverError}

Please return a NEW JSON payload that corrects the issue.
Respond with JSON only \u2013 no comments or explanations.
`;
    let response;
    try {
      response = await this._sendMessage(prompt);
    } catch (err) {
      throw new Error(`GPT call failed while repairing payload: ${err.message}`);
    }
    try {
      const text = this._extractText(response);
      return extractJSON(text);
    } catch (parseErr) {
      throw new Error(`GPT returned non-JSON while repairing payload: ${parseErr.message}`);
    }
  }
  // ── Stateless Send ───────────────────────────────────────────────────────
  /**
   * Sends a one-off message (not using chat history).
   * Does NOT affect conversation history.
   * @param {Object|string} payload
   * @param {Object} [opts={}]
   * @param {AsyncValidatorFunction|null} [validatorFn]
   * @returns {Promise<Object>}
   * @private
   */
  async _statelessSend(payload, opts = {}, validatorFn = null) {
    const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    const messages = [...this._buildSystemMessages()];
    if (this.exampleCount > 0) {
      const exampleHistory = this.history.slice(0, this.exampleCount);
      messages.push(...exampleHistory);
    }
    messages.push({ role: "user", content: payloadStr });
    const params = {
      model: this.modelName,
      max_tokens: opts.maxTokens || this.maxTokens,
      messages
    };
    if (!this.reasoningEffort) {
      if (this.temperature !== void 0) params.temperature = this.temperature;
      if (this.topP !== void 0) params.top_p = this.topP;
    }
    const response = await this.client.chat.completions.create(params);
    this._captureMetadata(response);
    this._cumulativeUsage = {
      promptTokens: this.lastResponseMetadata.promptTokens,
      responseTokens: this.lastResponseMetadata.responseTokens,
      totalTokens: this.lastResponseMetadata.totalTokens,
      attempts: 1
    };
    const modelResponse = response.choices[0].message.content || "";
    const extractedJSON = extractJSON(modelResponse);
    let transformedPayload = extractedJSON?.data ? extractedJSON.data : extractedJSON;
    if (validatorFn) {
      await validatorFn(transformedPayload);
    }
    return transformedPayload;
  }
  // ── History Management ───────────────────────────────────────────────────
  /**
   * Clears conversation history while preserving seeded examples.
   * @returns {Promise<void>}
   */
  async clearHistory() {
    const exampleHistory = this.history.slice(0, this.exampleCount || 0);
    this.history = exampleHistory;
    this.lastResponseMetadata = null;
    this._cumulativeUsage = { promptTokens: 0, responseTokens: 0, totalTokens: 0, attempts: 0 };
    logger_default.debug(`Conversation cleared. Preserved ${exampleHistory.length} example items.`);
  }
  /**
   * Fully resets the conversation, clearing all history including examples.
   * @returns {Promise<void>}
   */
  async reset() {
    this.history = [];
    this.exampleCount = 0;
    this.lastResponseMetadata = null;
    this._cumulativeUsage = { promptTokens: 0, responseTokens: 0, totalTokens: 0, attempts: 0 };
    logger_default.debug("Conversation fully reset.");
  }
  /**
   * Updates system prompt.
   * @param {string} newPrompt - The new system prompt
   * @returns {Promise<void>}
   */
  async updateSystemPrompt(newPrompt) {
    if (!newPrompt || typeof newPrompt !== "string") {
      throw new Error("System prompt must be a non-empty string");
    }
    this.systemPrompt = newPrompt.trim();
    logger_default.debug("System prompt updated.");
  }
  // ── Private Helpers ──────────────────────────────────────────────────────
  /**
   * Normalizes a payload to a string for sending.
   * @param {*} payload
   * @returns {string}
   * @private
   */
  _preparePayload(payload) {
    if (payload && isJSON(payload)) {
      return JSON.stringify(payload, null, 2);
    } else if (typeof payload === "string") {
      return payload;
    } else if (typeof payload === "boolean" || typeof payload === "number") {
      return payload.toString();
    } else if (payload === null || payload === void 0) {
      return JSON.stringify({});
    } else {
      throw new Error("Invalid source payload. Must be a JSON object or string.");
    }
  }
};
var transformer_default = Transformer;

// chat.js
var Chat = class extends base_default {
  /**
   * @param {Object} [options={}]
   */
  constructor(options = {}) {
    if (options.systemPrompt === void 0) {
      options = { ...options, systemPrompt: "You are a helpful AI assistant." };
    }
    super(options);
    logger_default.debug(`Chat created with model: ${this.modelName}`);
  }
  /**
   * Send a text message and get a response. Adds to conversation history.
   *
   * @param {string} message - The user's message
   * @param {Object} [opts={}] - Per-message options
   * @returns {Promise<{text: string, usage: Object}>} Response with text and usage data
   */
  async send(message, opts = {}) {
    const response = await this._sendMessage(message, opts);
    const text = this._extractText(response);
    this._cumulativeUsage = {
      promptTokens: this.lastResponseMetadata.promptTokens,
      responseTokens: this.lastResponseMetadata.responseTokens,
      totalTokens: this.lastResponseMetadata.totalTokens,
      attempts: 1
    };
    return {
      text,
      usage: this.getLastUsage()
    };
  }
  /**
   * Send a message and stream the response as events.
   *
   * @param {string} message - The user's message
   * @param {Object} [opts={}] - Per-message options
   * @yields {{ type: string, text?: string, fullText?: string, usage?: Object|null }}
   */
  async *stream(message, opts = {}) {
    if (!this._initialized) await this.init();
    let fullText = "";
    const streamIterable = await this._streamMessage(message, opts);
    for await (const chunk of streamIterable) {
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        fullText += delta.content;
        yield { type: "text", text: delta.content };
      }
      if (chunk.usage) {
        this.lastResponseMetadata = {
          modelVersion: chunk.model || null,
          requestedModel: this.modelName,
          promptTokens: chunk.usage.prompt_tokens || 0,
          responseTokens: chunk.usage.completion_tokens || 0,
          totalTokens: chunk.usage.total_tokens || 0,
          stopReason: chunk.choices?.[0]?.finish_reason || null,
          timestamp: Date.now()
        };
      }
    }
    this.history.push({ role: "assistant", content: fullText });
    yield {
      type: "done",
      fullText,
      usage: this.getLastUsage()
    };
  }
};
var chat_default = Chat;

// message.js
var Message = class extends base_default {
  /**
   * @param {Object} [options={}]
   */
  constructor(options = {}) {
    super(options);
    this._responseSchema = options.responseSchema || null;
    this._isStructured = !!(this._responseSchema || options.responseFormat === "json");
    logger_default.debug(`Message created (structured=${this._isStructured}, nativeSchema=${!!this._responseSchema})`);
  }
  /**
   * Initialize the Message client.
   * Override: stateless, no history management needed.
   * @param {boolean} [force=false]
   * @returns {Promise<void>}
   */
  async init(force = false) {
    if (this._initialized && !force) return;
    logger_default.debug(`Initializing ${this.constructor.name} with model: ${this.modelName}...`);
    if (this.healthCheck) {
      try {
        await this.client.chat.completions.create({
          model: this.modelName,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }]
        });
        logger_default.debug(`${this.constructor.name}: API connection successful.`);
      } catch (e) {
        throw new Error(`${this.constructor.name} initialization failed: ${e.message}`);
      }
    }
    this._initialized = true;
    logger_default.debug(`${this.constructor.name}: Initialized (stateless mode).`);
  }
  /**
   * Send a stateless message and get a response.
   * Each call is independent — no history is maintained.
   *
   * @param {Object|string} payload - The message or data to send
   * @param {Object} [opts={}] - Per-message options
   * @returns {Promise<{text: string, data?: Object, usage: Object}>} Response with text, optional data, and usage
   */
  async send(payload, opts = {}) {
    if (!this._initialized) await this.init();
    const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    const systemMessages = this._buildSystemMessages();
    let messages;
    if (this._isStructured && !this._responseSchema) {
      const jsonInstruction = "\n\nAlways respond ONLY with valid JSON. No markdown code blocks, no preamble text.";
      if (systemMessages.length > 0) {
        messages = [
          ...systemMessages.slice(0, -1),
          { ...systemMessages[systemMessages.length - 1], content: systemMessages[systemMessages.length - 1].content + jsonInstruction },
          { role: "user", content: payloadStr }
        ];
      } else {
        messages = [
          { role: "system", content: "Always respond ONLY with valid JSON. No markdown code blocks, no preamble text." },
          { role: "user", content: payloadStr }
        ];
      }
    } else {
      messages = [...systemMessages, { role: "user", content: payloadStr }];
    }
    const params = {
      model: this.modelName,
      messages
    };
    if (this.reasoningEffort) {
      params.reasoning_effort = this.reasoningEffort;
      params.max_completion_tokens = opts.maxTokens || this.maxTokens;
    } else {
      params.max_tokens = opts.maxTokens || this.maxTokens;
      if (this.temperature !== void 0) params.temperature = this.temperature;
      if (this.topP !== void 0) params.top_p = this.topP;
    }
    if (this._responseSchema) {
      params.response_format = {
        type: "json_schema",
        json_schema: {
          name: "response",
          strict: true,
          schema: this._responseSchema
        }
      };
    } else if (this._isStructured) {
      params.response_format = { type: "json_object" };
    }
    const response = await this.client.chat.completions.create(params);
    this._captureMetadata(response);
    this._cumulativeUsage = {
      promptTokens: this.lastResponseMetadata.promptTokens,
      responseTokens: this.lastResponseMetadata.responseTokens,
      totalTokens: this.lastResponseMetadata.totalTokens,
      attempts: 1
    };
    const text = this._extractText(response);
    const result = {
      text,
      usage: this.getLastUsage()
    };
    if (this._isStructured) {
      try {
        if (this._responseSchema) {
          result.data = JSON.parse(text);
        } else {
          result.data = extractJSON(text);
        }
      } catch (e) {
        logger_default.warn(`Could not parse structured response: ${e.message}`);
        result.data = null;
      }
    }
    return result;
  }
  // ── No-ops for stateless class ──
  /** @returns {Array} Always returns empty array (stateless). */
  getHistory() {
    return [];
  }
  /** No-op (stateless). */
  async clearHistory() {
  }
  /** Not supported on Message (stateless). */
  async seed() {
    logger_default.warn("Message is stateless \u2014 seed() has no effect. Use Transformer or Chat for few-shot learning.");
    return [];
  }
};
var message_default = Message;

// tool-agent.js
async function runWithConcurrency(tasks, concurrency) {
  if (concurrency === Infinity) return Promise.all(tasks.map((t) => t()));
  if (concurrency === 1) {
    const results2 = [];
    for (const t of tasks) results2.push(await t());
    return results2;
  }
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}
var ToolAgent = class extends base_default {
  /**
   * @param {ToolAgentOptions} [options={}]
   */
  constructor(options = {}) {
    if (options.systemPrompt === void 0) {
      options = { ...options, systemPrompt: "You are a helpful AI assistant." };
    }
    super(options);
    this.tools = (options.tools || []).map((t) => {
      if (t.type === "function" && t.function) return t;
      return {
        type: "function",
        function: {
          name: t.name,
          description: t.description || "",
          parameters: t.parameters || t.input_schema || t.inputSchema || t.parametersJsonSchema || { type: "object", properties: {} }
        }
      };
    });
    this.toolExecutor = options.toolExecutor || null;
    if (this.tools.length > 0 && !this.toolExecutor) {
      throw new Error("ToolAgent: tools provided without a toolExecutor. Provide a toolExecutor function to handle tool calls.");
    }
    if (this.toolExecutor && this.tools.length === 0) {
      throw new Error("ToolAgent: toolExecutor provided without tools. Provide tool declarations so the model knows what tools are available.");
    }
    this.toolChoice = options.toolChoice ?? void 0;
    this.disableParallelToolUse = options.disableParallelToolUse ?? false;
    this.parallelToolCalls = options.parallelToolCalls ?? true;
    this._concurrency = this.parallelToolCalls === true ? Infinity : this.parallelToolCalls === false ? 1 : this.parallelToolCalls;
    this.maxToolRounds = options.maxToolRounds || 10;
    this.onToolCall = options.onToolCall || null;
    this.onBeforeExecution = options.onBeforeExecution || null;
    this._stopped = false;
    logger_default.debug(`ToolAgent created with ${this.tools.length} tools`);
  }
  /**
   * Builds the tool_choice parameter for OpenAI API calls.
   * Maps from Claude/Gemini-style tool choice to OpenAI format:
   *   'auto' | { type: 'auto' }           → 'auto'
   *   'any'  | { type: 'any' }            → 'required'
   *   'none' | { type: 'none' }           → 'none'
   *   { type: 'tool', name: 'x' }         → { type: 'function', function: { name: 'x' } }
   *
   * @returns {string|Object|undefined}
   * @private
   */
  _buildToolChoice() {
    let choice = this.toolChoice;
    if (!choice && !this.disableParallelToolUse) return void 0;
    if (!choice) choice = "auto";
    if (typeof choice === "string") {
      if (choice === "auto") return "auto";
      if (choice === "any") return "required";
      if (choice === "none") return "none";
      return choice;
    }
    if (choice.type === "auto") return "auto";
    if (choice.type === "any") return "required";
    if (choice.type === "none") return "none";
    if (choice.type === "tool" && choice.name) {
      return { type: "function", function: { name: choice.name } };
    }
    return void 0;
  }
  // ── Non-Streaming Chat ───────────────────────────────────────────────────
  /**
   * Send a message and get a complete response (non-streaming).
   * Automatically handles the tool-use loop.
   *
   * @param {string} message - The user's message
   * @param {Object} [opts={}] - Per-message options
   * @returns {Promise<AgentResponse>} Response with text, toolCalls, and usage
   */
  async chat(message, opts = {}) {
    if (!this._initialized) await this.init();
    this._stopped = false;
    const allToolCalls = [];
    const toolChoice = this._buildToolChoice();
    const sendOpts = {
      tools: this.tools,
      ...toolChoice && { tool_choice: toolChoice },
      ...this.disableParallelToolUse && { parallel_tool_calls: false }
    };
    let response = await this._sendMessage(message, sendOpts);
    for (let round = 0; round < this.maxToolRounds; round++) {
      if (this._stopped) break;
      if (response.choices[0].finish_reason !== "tool_calls") break;
      const toolCallBlocks = response.choices[0].message.tool_calls;
      if (!toolCallBlocks || toolCallBlocks.length === 0) break;
      const tasks = toolCallBlocks.map((tc) => async () => {
        const args = JSON.parse(tc.function.arguments);
        if (this.onToolCall) {
          try {
            this.onToolCall(tc.function.name, args);
          } catch (e) {
            logger_default.warn(`onToolCall callback error: ${e.message}`);
          }
        }
        if (this.onBeforeExecution) {
          try {
            const allowed = await this.onBeforeExecution(tc.function.name, args);
            if (allowed === false) {
              const result2 = { error: "Execution denied by onBeforeExecution callback" };
              return {
                toolCall: { name: tc.function.name, args, result: result2 },
                toolResult: { role: "tool", tool_call_id: tc.id, content: JSON.stringify(result2) }
              };
            }
          } catch (e) {
            logger_default.warn(`onBeforeExecution callback error: ${e.message}`);
          }
        }
        let result;
        try {
          result = await this.toolExecutor(tc.function.name, args);
        } catch (err) {
          logger_default.warn(`Tool ${tc.function.name} failed: ${err.message}`);
          result = { error: err.message };
        }
        return {
          toolCall: { name: tc.function.name, args, result },
          toolResult: { role: "tool", tool_call_id: tc.id, content: typeof result === "string" ? result : JSON.stringify(result) }
        };
      });
      const results = await runWithConcurrency(tasks, this._concurrency);
      const toolMessages = results.map((r) => r.toolResult);
      for (const r of results) allToolCalls.push(r.toolCall);
      response = await this._sendMessage(toolMessages, sendOpts);
    }
    this._cumulativeUsage = {
      promptTokens: this.lastResponseMetadata.promptTokens,
      responseTokens: this.lastResponseMetadata.responseTokens,
      totalTokens: this.lastResponseMetadata.totalTokens,
      attempts: 1
    };
    return {
      text: this._extractText(response),
      toolCalls: allToolCalls,
      usage: this.getLastUsage()
    };
  }
  // ── Streaming ────────────────────────────────────────────────────────────
  /**
   * Send a message and stream the response as events.
   * Automatically handles the tool-use loop between streamed rounds.
   *
   * Event types:
   * - `text` — A chunk of the agent's text response
   * - `tool_call` — The agent is about to call a tool
   * - `tool_result` — A tool finished executing
   * - `done` — The agent finished
   *
   * @param {string} message - The user's message
   * @param {Object} [opts={}] - Per-message options
   * @yields {AgentStreamEvent}
   */
  async *stream(message, opts = {}) {
    if (!this._initialized) await this.init();
    this._stopped = false;
    const allToolCalls = [];
    let fullText = "";
    const toolChoice = this._buildToolChoice();
    const sendOpts = {
      tools: this.tools,
      ...toolChoice && { tool_choice: toolChoice },
      ...this.disableParallelToolUse && { parallel_tool_calls: false }
    };
    let currentMessage = message;
    for (let round = 0; round <= this.maxToolRounds; round++) {
      if (this._stopped) break;
      const streamIterable = await this._streamMessage(currentMessage, sendOpts);
      let fullContent = "";
      let toolCallsAccum = {};
      let finishReason = null;
      let usage = null;
      for await (const chunk of streamIterable) {
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          fullText += delta.content;
          yield { type: "text", text: delta.content };
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallsAccum[tc.index]) toolCallsAccum[tc.index] = { id: "", name: "", arguments: "" };
            if (tc.id) toolCallsAccum[tc.index].id = tc.id;
            if (tc.function?.name) toolCallsAccum[tc.index].name += tc.function.name;
            if (tc.function?.arguments) toolCallsAccum[tc.index].arguments += tc.function.arguments;
          }
        }
        if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
        if (chunk.usage) usage = chunk.usage;
      }
      const assistantMsg = { role: "assistant", content: fullContent || null };
      const toolCalls = Object.values(toolCallsAccum);
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments }
        }));
      }
      this.history.push(assistantMsg);
      if (usage) {
        this.lastResponseMetadata = {
          modelVersion: null,
          requestedModel: this.modelName,
          promptTokens: usage.prompt_tokens || 0,
          responseTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          stopReason: finishReason,
          timestamp: Date.now()
        };
      }
      if (finishReason !== "tool_calls" || toolCalls.length === 0) {
        yield {
          type: "done",
          fullText,
          usage: this.getLastUsage()
        };
        return;
      }
      const toolResults = [];
      if (this._concurrency === 1) {
        for (const tc of toolCalls) {
          if (this._stopped) break;
          const args = JSON.parse(tc.arguments);
          yield { type: "tool_call", toolName: tc.name, args };
          if (this.onToolCall) {
            try {
              this.onToolCall(tc.name, args);
            } catch (e) {
              logger_default.warn(`onToolCall callback error: ${e.message}`);
            }
          }
          let denied = false;
          if (this.onBeforeExecution) {
            try {
              const allowed = await this.onBeforeExecution(tc.name, args);
              if (allowed === false) denied = true;
            } catch (e) {
              logger_default.warn(`onBeforeExecution callback error: ${e.message}`);
            }
          }
          let result;
          if (denied) {
            result = { error: "Execution denied by onBeforeExecution callback" };
          } else {
            try {
              result = await this.toolExecutor(tc.name, args);
            } catch (err) {
              logger_default.warn(`Tool ${tc.name} failed: ${err.message}`);
              result = { error: err.message };
            }
          }
          allToolCalls.push({ name: tc.name, args, result });
          yield { type: "tool_result", toolName: tc.name, result };
          toolResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content: typeof result === "string" ? result : JSON.stringify(result)
          });
        }
      } else {
        const parsedCalls = toolCalls.map((tc) => ({ ...tc, parsedArgs: JSON.parse(tc.arguments) }));
        for (const tc of parsedCalls) {
          yield { type: "tool_call", toolName: tc.name, args: tc.parsedArgs };
        }
        const tasks = parsedCalls.map((tc) => async () => {
          if (this.onToolCall) {
            try {
              this.onToolCall(tc.name, tc.parsedArgs);
            } catch (e) {
              logger_default.warn(`onToolCall callback error: ${e.message}`);
            }
          }
          let denied = false;
          if (this.onBeforeExecution) {
            try {
              const allowed = await this.onBeforeExecution(tc.name, tc.parsedArgs);
              if (allowed === false) denied = true;
            } catch (e) {
              logger_default.warn(`onBeforeExecution callback error: ${e.message}`);
            }
          }
          let result;
          if (denied) {
            result = { error: "Execution denied by onBeforeExecution callback" };
          } else {
            try {
              result = await this.toolExecutor(tc.name, tc.parsedArgs);
            } catch (err) {
              logger_default.warn(`Tool ${tc.name} failed: ${err.message}`);
              result = { error: err.message };
            }
          }
          return {
            toolCall: { name: tc.name, args: tc.parsedArgs, result },
            toolResult: {
              role: "tool",
              tool_call_id: tc.id,
              content: typeof result === "string" ? result : JSON.stringify(result)
            }
          };
        });
        const results = await runWithConcurrency(tasks, this._concurrency);
        for (const r of results) {
          allToolCalls.push(r.toolCall);
          yield { type: "tool_result", toolName: r.toolCall.name, result: r.toolCall.result };
          toolResults.push(r.toolResult);
        }
      }
      currentMessage = toolResults;
    }
    yield {
      type: "done",
      fullText,
      usage: this.getLastUsage(),
      warning: this._stopped ? "Agent was stopped" : "Max tool rounds reached"
    };
  }
  // ── Stop ────────────────────────────────────────────────────────────────
  /**
   * Stop the agent before the next tool execution round.
   * If called during a chat() or stream() loop, the agent will finish
   * the current round and then stop.
   */
  stop() {
    this._stopped = true;
    logger_default.info("ToolAgent stopped");
  }
};
var tool_agent_default = ToolAgent;

// code-agent.js
var import_node_child_process = require("node:child_process");
var import_promises2 = require("node:fs/promises");
var import_node_path = require("node:path");
var import_node_crypto = require("node:crypto");
var MAX_OUTPUT_CHARS = 5e4;
var MAX_FILE_TREE_LINES = 500;
var IGNORE_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "coverage", ".next", "build", "__pycache__"]);
var EXECUTING_TOOLS = /* @__PURE__ */ new Set(["execute_code", "write_and_run_code", "run_bash"]);
var CodeAgent = class extends base_default {
  /**
   * @param {CodeAgentOptions} [options={}]
   */
  constructor(options = {}) {
    if (options.systemPrompt === void 0) {
      options = { ...options, systemPrompt: "" };
    }
    super(options);
    this.workingDirectory = options.workingDirectory || process.cwd();
    this.maxRounds = options.maxRounds || 10;
    this.timeout = options.timeout || 3e4;
    this.onBeforeExecution = options.onBeforeExecution || null;
    this.onCodeExecution = options.onCodeExecution || null;
    this.importantFiles = options.importantFiles || [];
    this.writeDir = options.writeDir || (0, import_node_path.join)(this.workingDirectory, "tmp");
    this.keepArtifacts = options.keepArtifacts ?? false;
    this.comments = options.comments ?? false;
    this.codeMaxRetries = options.maxRetries ?? 3;
    this.skills = options.skills || [];
    this.envOverview = options.envOverview || "";
    this.customTools = (options.tools || []).map((t) => {
      if (t.type === "function" && t.function) {
        return {
          type: "function",
          function: {
            name: t.function.name,
            description: t.function.description || "",
            parameters: t.function.parameters || { type: "object", properties: {} }
          }
        };
      }
      return {
        type: "function",
        function: {
          name: t.name || "",
          description: t.description || "",
          parameters: t.parameters || t.input_schema || t.inputSchema || t.parametersJsonSchema || { type: "object", properties: {} }
        }
      };
    });
    this.toolExecutor = options.toolExecutor || null;
    if (this.customTools.length > 0 && !this.toolExecutor) {
      throw new Error("CodeAgent: tools provided without a toolExecutor.");
    }
    this._codebaseContext = null;
    this._contextGathered = false;
    this._stopped = false;
    this._activeProcess = null;
    this._userSystemPrompt = options.systemPrompt || "";
    this._allExecutions = [];
    this._skillRegistry = /* @__PURE__ */ new Map();
    this._tools = this._buildToolDefinitions();
    logger_default.debug(`CodeAgent created for directory: ${this.workingDirectory}`);
  }
  // ── Tool Definitions ─────────────────────────────────────────────────────
  /**
   * Build tool definitions in OpenAI format.
   * use_skill is only included when skills are registered.
   * @private
   * @returns {Array<{type: string, function: {name: string, description: string, parameters: Object}}>}
   */
  _buildToolDefinitions() {
    const tools = [
      {
        type: "function",
        function: {
          name: "write_code",
          description: "Output code without executing it. Use this when you want to show, propose, or present code to the user without running it.",
          parameters: {
            type: "object",
            properties: {
              code: { type: "string", description: "The code to output." },
              purpose: { type: "string", description: 'A short 2-4 word slug describing the code (e.g., "api-client", "data-parser").' },
              language: { type: "string", description: 'Programming language of the code (default: "javascript").' }
            },
            required: ["code"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "execute_code",
          description: "Execute a given piece of JavaScript code in a Node.js child process. Use this when you already have code to run \u2014 e.g., running code from a previous write_code call, re-running a snippet, or executing code the user provided. Use console.log() for output.",
          parameters: {
            type: "object",
            properties: {
              code: { type: "string", description: "JavaScript code to execute. Use console.log() for output. Use import syntax (ES modules)." },
              purpose: { type: "string", description: 'A short 2-4 word slug describing what this script does (e.g., "read-config", "parse-logs").' }
            },
            required: ["code"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "write_and_run_code",
          description: "Write a fresh solution from scratch and execute it in one step. Use this when you need to figure out the code AND run it \u2014 the autonomous, end-to-end tool for solving problems with code.",
          parameters: {
            type: "object",
            properties: {
              code: { type: "string", description: "JavaScript code to write and execute. Use console.log() for output. Use import syntax (ES modules)." },
              purpose: { type: "string", description: 'A short 2-4 word slug describing what this script does (e.g., "fetch-api-data", "generate-report").' }
            },
            required: ["code"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "fix_code",
          description: "Fix broken code. Provide the original and fixed versions with an explanation. Optionally execute the fix to verify it works.",
          parameters: {
            type: "object",
            properties: {
              original_code: { type: "string", description: "The original broken code." },
              fixed_code: { type: "string", description: "The corrected code." },
              explanation: { type: "string", description: "Brief explanation of what was wrong and how it was fixed." },
              execute: { type: "boolean", description: "If true, execute the fixed code to verify it works (default: false)." }
            },
            required: ["original_code", "fixed_code"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "run_bash",
          description: "Execute a shell command in the working directory. Use this for file operations, git commands, installing packages, or any shell task. Prefer this over execute_code for simple shell operations.",
          parameters: {
            type: "object",
            properties: {
              command: { type: "string", description: "The shell command to execute." },
              purpose: { type: "string", description: 'A short 2-4 word slug describing the command (e.g., "list-files", "install-deps").' }
            },
            required: ["command"]
          }
        }
      }
    ];
    if (this._skillRegistry && this._skillRegistry.size > 0) {
      tools.push({
        type: "function",
        function: {
          name: "use_skill",
          description: `Load a skill by name to get instructions, templates, or patterns. Available skills: ${[...this._skillRegistry.keys()].join(", ")}`,
          parameters: {
            type: "object",
            properties: {
              skill_name: { type: "string", description: "The name of the skill to load." }
            },
            required: ["skill_name"]
          }
        }
      });
    }
    for (const t of this.customTools) {
      tools.push(t);
    }
    return tools;
  }
  // ── Init ─────────────────────────────────────────────────────────────────
  /**
   * Initialize the agent: load skills, gather codebase context, and build system prompt.
   * @param {boolean} [force=false]
   */
  async init(force = false) {
    if (this._initialized && !force) return;
    await this._ensureClient();
    if (this.skills.length > 0 && (this._skillRegistry.size === 0 || force)) {
      await this._loadSkills();
    }
    this._tools = this._buildToolDefinitions();
    if (!this._contextGathered || force) {
      await this._gatherCodebaseContext();
    }
    this.systemPrompt = this._buildSystemPrompt();
    await super.init(force);
  }
  // ── Skill Loading ────────────────────────────────────────────────────────
  /**
   * Load skill files into the skill registry.
   * @private
   */
  async _loadSkills() {
    this._skillRegistry.clear();
    for (const filePath of this.skills) {
      try {
        const content = await (0, import_promises2.readFile)(filePath, "utf-8");
        let name = (0, import_node_path.basename)(filePath).replace(/\.md$/i, "");
        const fmMatch = content.match(/^---\s*\n[\s\S]*?^name:\s*(.+)$/m);
        if (fmMatch) name = fmMatch[1].trim();
        this._skillRegistry.set(name, { name, content, path: filePath });
        logger_default.debug(`Loaded skill: ${name} from ${filePath}`);
      } catch (e) {
        logger_default.warn(`skills: could not load "${filePath}": ${e.message}`);
      }
    }
  }
  // ── Context Gathering ────────────────────────────────────────────────────
  /**
   * @private
   */
  async _gatherCodebaseContext() {
    let fileTree = "";
    try {
      fileTree = await this._getFileTreeGit();
    } catch {
      logger_default.debug("git ls-files failed, falling back to readdir");
      fileTree = await this._getFileTreeReaddir(this.workingDirectory, 0, 3);
    }
    const lines = fileTree.split("\n");
    if (lines.length > MAX_FILE_TREE_LINES) {
      const truncated = lines.slice(0, MAX_FILE_TREE_LINES).join("\n");
      fileTree = `${truncated}
... (${lines.length - MAX_FILE_TREE_LINES} more files)`;
    }
    let npmPackages = [];
    try {
      const pkgPath = (0, import_node_path.join)(this.workingDirectory, "package.json");
      const pkg = JSON.parse(await (0, import_promises2.readFile)(pkgPath, "utf-8"));
      npmPackages = [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {})
      ];
    } catch {
    }
    const importantFileContents = [];
    if (this.importantFiles.length > 0) {
      const fileTreeLines = fileTree.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const requested of this.importantFiles) {
        const resolved = this._resolveImportantFile(requested, fileTreeLines);
        if (!resolved) {
          logger_default.warn(`importantFiles: could not locate "${requested}"`);
          continue;
        }
        try {
          const fullPath = (0, import_node_path.isAbsolute)(resolved) ? resolved : (0, import_node_path.join)(this.workingDirectory, resolved);
          const content = await (0, import_promises2.readFile)(fullPath, "utf-8");
          importantFileContents.push({ path: resolved, content });
        } catch (e) {
          logger_default.warn(`importantFiles: could not read "${resolved}": ${e.message}`);
        }
      }
    }
    this._codebaseContext = { fileTree, npmPackages, importantFileContents };
    this._contextGathered = true;
  }
  /**
   * @private
   */
  _resolveImportantFile(filename, fileTreeLines) {
    if ((0, import_node_path.isAbsolute)(filename)) return filename;
    const exact = fileTreeLines.find((line) => line === filename);
    if (exact) return exact;
    const partial = fileTreeLines.find(
      (line) => line.endsWith("/" + filename) || line.endsWith(import_node_path.sep + filename)
    );
    return partial || null;
  }
  /**
   * @private
   */
  async _getFileTreeGit() {
    return new Promise((resolve2, reject) => {
      (0, import_node_child_process.execFile)("git", ["ls-files"], {
        cwd: this.workingDirectory,
        timeout: 5e3,
        maxBuffer: 5 * 1024 * 1024
      }, (err, stdout) => {
        if (err) return reject(err);
        resolve2(stdout.trim());
      });
    });
  }
  /**
   * @private
   */
  async _getFileTreeReaddir(dir, depth, maxDepth) {
    if (depth >= maxDepth) return "";
    const entries = [];
    try {
      const items = await (0, import_promises2.readdir)(dir, { withFileTypes: true });
      for (const item of items) {
        if (IGNORE_DIRS.has(item.name)) continue;
        if (item.name.startsWith(".") && depth === 0 && item.isDirectory()) continue;
        const relativePath = (0, import_node_path.join)(dir, item.name).replace(this.workingDirectory + "/", "");
        if (item.isFile()) {
          entries.push(relativePath);
        } else if (item.isDirectory()) {
          entries.push(relativePath + "/");
          const subEntries = await this._getFileTreeReaddir((0, import_node_path.join)(dir, item.name), depth + 1, maxDepth);
          if (subEntries) entries.push(subEntries);
        }
      }
    } catch {
    }
    return entries.join("\n");
  }
  /**
   * @private
   */
  _buildSystemPrompt() {
    const { fileTree, npmPackages, importantFileContents } = this._codebaseContext || { fileTree: "", npmPackages: [], importantFileContents: [] };
    let prompt = `You are a coding agent working in ${this.workingDirectory}.

## Available Tools

### write_code
Output code without executing it. Use when showing, proposing, or presenting code to the user.

### execute_code
Run a given piece of JavaScript code. Use when you already have code to run \u2014 e.g., from a previous write_code call, re-running a snippet, or executing user-provided code.

### write_and_run_code
Write a fresh solution from scratch and execute it in one step. The autonomous, end-to-end tool for solving problems with code.

### fix_code
Fix broken code by providing original and fixed versions. Set execute=true to verify the fix works.

### run_bash
Run shell commands directly (e.g., ls, grep, curl, git, npm, cat). Prefer this over execute_code for simple shell operations.`;
    if (this._skillRegistry.size > 0) {
      prompt += `

### use_skill
Load a skill by name to get detailed instructions and templates. Available skills: ${[...this._skillRegistry.keys()].join(", ")}`;
    }
    prompt += `

## Code Execution Rules
These rules apply when using execute_code, write_and_run_code, or fix_code (with execute=true):
- Always provide a short descriptive \`purpose\` parameter (2-4 word slug like "read-config")
- Your code runs in a Node.js child process with access to all built-in modules
- IMPORTANT: Your code runs as an ES module (.mjs). Use import syntax, NOT require():
  - import fs from 'fs';
  - import path from 'path';
  - import { execSync } from 'child_process';
- Use console.log() to produce output \u2014 that's how results are returned to you
- Write efficient scripts that do multiple things per execution when possible
- For parallel async operations, use Promise.all()
- Handle errors in your scripts with try/catch so you get useful error messages
- Top-level await is supported
- The working directory is: ${this.workingDirectory}`;
    if (this.comments) {
      prompt += `
- Add a JSDoc @fileoverview comment at the top of each script explaining what it does
- Add brief JSDoc @param comments for any functions you define`;
    } else {
      prompt += `
- Do NOT write any comments in your code \u2014 save tokens. The code should be self-explanatory.`;
    }
    if (fileTree) {
      prompt += `

## File Tree
\`\`\`
${fileTree}
\`\`\``;
    }
    if (npmPackages.length > 0) {
      prompt += `

## Available Packages
These npm packages are installed and can be imported: ${npmPackages.join(", ")}`;
    }
    if (importantFileContents && importantFileContents.length > 0) {
      prompt += `

## Key Files`;
      for (const { path: filePath, content } of importantFileContents) {
        prompt += `

### ${filePath}
\`\`\`javascript
${content}
\`\`\``;
      }
    }
    if (this._userSystemPrompt) {
      prompt += `

## Additional Instructions
${this._userSystemPrompt}`;
    }
    if (this.envOverview) {
      prompt += `

## Environment Overview
${this.envOverview}`;
    }
    return prompt;
  }
  // ── Code Execution ───────────────────────────────────────────────────────
  /**
   * @private
   */
  _slugify(purpose) {
    if (!purpose) return (0, import_node_crypto.randomUUID)().slice(0, 8);
    return purpose.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }
  /**
   * @private
   */
  async _executeCode(code, purpose, toolName) {
    if (this._stopped) {
      return { stdout: "", stderr: "Agent was stopped", exitCode: -1 };
    }
    if (this.onBeforeExecution) {
      try {
        const allowed = await this.onBeforeExecution(code, toolName || "execute_code");
        if (allowed === false) {
          return { stdout: "", stderr: "Execution denied by onBeforeExecution callback", exitCode: -1, denied: true };
        }
      } catch (e) {
        logger_default.warn(`onBeforeExecution callback error: ${e.message}`);
      }
    }
    await (0, import_promises2.mkdir)(this.writeDir, { recursive: true });
    const slug = this._slugify(purpose);
    const tempFile = (0, import_node_path.join)(this.writeDir, `agent-${slug}-${Date.now()}.mjs`);
    try {
      await (0, import_promises2.writeFile)(tempFile, code, "utf-8");
      const result = await new Promise((resolve2) => {
        const child = (0, import_node_child_process.execFile)("node", [tempFile], {
          cwd: this.workingDirectory,
          timeout: this.timeout,
          env: process.env,
          maxBuffer: 10 * 1024 * 1024
        }, (err, stdout, stderr) => {
          this._activeProcess = null;
          if (err) {
            resolve2({
              stdout: err.stdout || stdout || "",
              stderr: (err.stderr || stderr || "") + (err.killed ? "\n[EXECUTION TIMED OUT]" : ""),
              exitCode: err.code || 1
            });
          } else {
            resolve2({ stdout: stdout || "", stderr: stderr || "", exitCode: 0 });
          }
        });
        this._activeProcess = child;
      });
      const totalLen = result.stdout.length + result.stderr.length;
      if (totalLen > MAX_OUTPUT_CHARS) {
        const half = Math.floor(MAX_OUTPUT_CHARS / 2);
        if (result.stdout.length > half) {
          result.stdout = result.stdout.slice(0, half) + "\n...[OUTPUT TRUNCATED]";
        }
        if (result.stderr.length > half) {
          result.stderr = result.stderr.slice(0, half) + "\n...[STDERR TRUNCATED]";
        }
      }
      this._allExecutions.push({
        code,
        purpose: purpose || null,
        output: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        filePath: this.keepArtifacts ? tempFile : null,
        tool: toolName || "execute_code"
      });
      if (this.onCodeExecution) {
        try {
          this.onCodeExecution(code, result);
        } catch (e) {
          logger_default.warn(`onCodeExecution callback error: ${e.message}`);
        }
      }
      return result;
    } finally {
      if (!this.keepArtifacts) {
        try {
          await (0, import_promises2.unlink)(tempFile);
        } catch {
        }
      }
    }
  }
  // ── Bash Execution ───────────────────────────────────────────────────────
  /**
   * Execute a bash command in the working directory.
   * @private
   */
  async _executeBash(command, purpose) {
    if (this._stopped) {
      return { stdout: "", stderr: "Agent was stopped", exitCode: -1 };
    }
    if (this.onBeforeExecution) {
      try {
        const allowed = await this.onBeforeExecution(command, "run_bash");
        if (allowed === false) {
          return { stdout: "", stderr: "Execution denied by onBeforeExecution callback", exitCode: -1, denied: true };
        }
      } catch (e) {
        logger_default.warn(`onBeforeExecution callback error: ${e.message}`);
      }
    }
    const result = await new Promise((resolve2) => {
      const child = (0, import_node_child_process.execFile)("bash", ["-c", command], {
        cwd: this.workingDirectory,
        timeout: this.timeout,
        env: process.env,
        maxBuffer: 10 * 1024 * 1024
      }, (err, stdout, stderr) => {
        this._activeProcess = null;
        if (err) {
          resolve2({
            stdout: err.stdout || stdout || "",
            stderr: (err.stderr || stderr || "") + (err.killed ? "\n[EXECUTION TIMED OUT]" : ""),
            exitCode: err.code || 1
          });
        } else {
          resolve2({ stdout: stdout || "", stderr: stderr || "", exitCode: 0 });
        }
      });
      this._activeProcess = child;
    });
    const totalLen = result.stdout.length + result.stderr.length;
    if (totalLen > MAX_OUTPUT_CHARS) {
      const half = Math.floor(MAX_OUTPUT_CHARS / 2);
      if (result.stdout.length > half) {
        result.stdout = result.stdout.slice(0, half) + "\n...[OUTPUT TRUNCATED]";
      }
      if (result.stderr.length > half) {
        result.stderr = result.stderr.slice(0, half) + "\n...[STDERR TRUNCATED]";
      }
    }
    this._allExecutions.push({
      code: command,
      purpose: purpose || null,
      output: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      filePath: null,
      tool: "run_bash"
    });
    if (this.onCodeExecution) {
      try {
        this.onCodeExecution(command, result);
      } catch (e) {
        logger_default.warn(`onCodeExecution callback error: ${e.message}`);
      }
    }
    return result;
  }
  /**
   * @private
   */
  _formatOutput(result) {
    let output = "";
    if (result.stdout) output += result.stdout;
    if (result.stderr) output += (output ? "\n" : "") + `[STDERR]: ${result.stderr}`;
    if (result.exitCode !== 0) output += (output ? "\n" : "") + `[EXIT CODE]: ${result.exitCode}`;
    return output || "(no output)";
  }
  // ── Tool Call Dispatch ───────────────────────────────────────────────────
  /**
   * Handle a tool call by name, dispatching to the appropriate handler.
   * @private
   * @param {string} name - Tool name
   * @param {Object} input - Tool arguments
   * @returns {Promise<{output: string, type: string, data: Object}>}
   */
  async _handleToolCall(name, input) {
    switch (name) {
      case "execute_code":
      case "write_and_run_code": {
        const result = await this._executeCode(input.code || "", input.purpose, name);
        return {
          output: this._formatOutput(result),
          type: "code_execution",
          data: {
            tool: name,
            code: input.code || "",
            purpose: input.purpose,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            denied: result.denied
          }
        };
      }
      case "write_code": {
        return {
          output: "Code written successfully.",
          type: "write",
          data: {
            tool: "write_code",
            code: input.code || "",
            purpose: input.purpose,
            language: input.language || "javascript"
          }
        };
      }
      case "fix_code": {
        let execResult = null;
        if (input.execute) {
          execResult = await this._executeCode(input.fixed_code || "", "fix", "fix_code");
        }
        return {
          output: input.execute ? this._formatOutput(execResult) : "Fix recorded.",
          type: "fix",
          data: {
            tool: "fix_code",
            originalCode: input.original_code || "",
            fixedCode: input.fixed_code || "",
            explanation: input.explanation,
            executed: !!input.execute,
            stdout: execResult?.stdout,
            stderr: execResult?.stderr,
            exitCode: execResult?.exitCode,
            denied: execResult?.denied
          }
        };
      }
      case "run_bash": {
        const result = await this._executeBash(input.command || "", input.purpose);
        return {
          output: this._formatOutput(result),
          type: "bash",
          data: {
            tool: "run_bash",
            command: input.command || "",
            purpose: input.purpose,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            denied: result.denied
          }
        };
      }
      case "use_skill": {
        const skillName = input.skill_name || "";
        const skill = this._skillRegistry.get(skillName);
        if (!skill) {
          const available = [...this._skillRegistry.keys()].join(", ");
          return {
            output: `Skill "${skillName}" not found. Available skills: ${available || "(none)"}`,
            type: "skill",
            data: { tool: "use_skill", skillName, found: false }
          };
        }
        return {
          output: skill.content,
          type: "skill",
          data: { tool: "use_skill", skillName: skill.name, content: skill.content, found: true }
        };
      }
      default: {
        if (this.toolExecutor) {
          try {
            const result = await this.toolExecutor(name, input);
            const resultStr = typeof result === "string" ? result : JSON.stringify(result);
            return {
              output: resultStr,
              type: "tool",
              data: { tool: name, args: input, result }
            };
          } catch (err) {
            return {
              output: `Tool "${name}" failed: ${err.message}`,
              type: "tool",
              data: { tool: name, args: input, error: err.message }
            };
          }
        }
        return {
          output: `Unknown tool: ${name}`,
          type: "unknown",
          data: { tool: name }
        };
      }
    }
  }
  // ── Non-Streaming Chat ───────────────────────────────────────────────────
  /**
   * Send a message and get a complete response (non-streaming).
   * Automatically handles the multi-tool execution loop.
   *
   * @param {string} message - The user's message
   * @param {Object} [opts={}] - Per-message options
   * @returns {Promise<CodeAgentResponse>}
   */
  async chat(message, opts = {}) {
    if (!this._initialized) await this.init();
    this._stopped = false;
    const toolCalls = [];
    let consecutiveFailures = 0;
    let response = await this._sendMessage(message, { tools: this._tools });
    for (let round = 0; round < this.maxRounds; round++) {
      if (this._stopped) break;
      if (response.choices[0].finish_reason !== "tool_calls") break;
      const rawToolCalls = response.choices[0].message.tool_calls;
      if (!rawToolCalls || rawToolCalls.length === 0) break;
      const toolResults = [];
      for (const block of rawToolCalls) {
        if (this._stopped) break;
        const parsedArgs = JSON.parse(block.function.arguments);
        const { output, type, data } = await this._handleToolCall(block.function.name, parsedArgs);
        toolCalls.push(data);
        const isExecutingTool = EXECUTING_TOOLS.has(block.function.name) || block.function.name === "fix_code" && parsedArgs.execute;
        if (isExecutingTool) {
          if (data.exitCode !== 0 && !data.denied) {
            consecutiveFailures++;
          } else {
            consecutiveFailures = 0;
          }
        }
        let toolOutput = output;
        if (consecutiveFailures >= this.codeMaxRetries) {
          toolOutput += `

[RETRY LIMIT REACHED] You have failed ${this.codeMaxRetries} consecutive attempts. STOP trying to execute code. Instead, respond with: 1) What you were trying to do, 2) The errors you encountered, 3) Questions for the user about how to resolve it.`;
        }
        toolResults.push({
          role: "tool",
          tool_call_id: block.id,
          content: toolOutput
        });
      }
      if (this._stopped) break;
      response = await this._sendMessage(toolResults, { tools: this._tools });
      if (consecutiveFailures >= this.codeMaxRetries) break;
    }
    this._cumulativeUsage = {
      promptTokens: this.lastResponseMetadata.promptTokens,
      responseTokens: this.lastResponseMetadata.responseTokens,
      totalTokens: this.lastResponseMetadata.totalTokens,
      attempts: 1
    };
    const codeExecutions = toolCalls.filter((tc) => tc.tool === "execute_code" || tc.tool === "write_and_run_code" || tc.tool === "fix_code" && tc.executed).map((tc) => ({
      code: tc.code || tc.fixedCode,
      purpose: this._slugify(tc.purpose),
      output: tc.stdout || "",
      stderr: tc.stderr || "",
      exitCode: tc.exitCode ?? 0
    }));
    return {
      text: this._extractText(response),
      codeExecutions,
      toolCalls,
      usage: this.getLastUsage()
    };
  }
  // ── Streaming ────────────────────────────────────────────────────────────
  /**
   * Send a message and stream the response as events.
   *
   * Event types:
   * - `text` — A chunk of the agent's text response
   * - `code` — The agent is about to execute code (execute_code or write_and_run_code)
   * - `output` — Code/bash finished executing
   * - `write` — The agent wrote code without executing (write_code)
   * - `fix` — The agent fixed code (fix_code)
   * - `bash` — The agent is about to run a bash command
   * - `skill` — The agent loaded a skill
   * - `done` — The agent finished
   *
   * @param {string} message - The user's message
   * @param {Object} [opts={}]
   * @yields {CodeAgentStreamEvent}
   */
  async *stream(message, opts = {}) {
    if (!this._initialized) await this.init();
    this._stopped = false;
    const toolCalls = [];
    let fullText = "";
    let consecutiveFailures = 0;
    let streamIterable = await this._streamMessage(message, { tools: this._tools });
    for (let round = 0; round < this.maxRounds; round++) {
      if (this._stopped) break;
      let contentText = "";
      let toolCallsAccum = {};
      let finishReason = null;
      for await (const chunk of streamIterable) {
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          contentText += delta.content;
          yield { type: "text", text: delta.content };
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallsAccum[tc.index]) toolCallsAccum[tc.index] = { id: "", name: "", arguments: "" };
            if (tc.id) toolCallsAccum[tc.index].id = tc.id;
            if (tc.function?.name) toolCallsAccum[tc.index].name += tc.function.name;
            if (tc.function?.arguments) toolCallsAccum[tc.index].arguments += tc.function.arguments;
          }
        }
        if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
      }
      fullText += contentText;
      const assistantMsg = { role: "assistant", content: contentText || null };
      const accumulatedToolCalls = Object.values(toolCallsAccum);
      if (accumulatedToolCalls.length > 0) {
        assistantMsg.tool_calls = accumulatedToolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments }
        }));
      }
      this.history.push(assistantMsg);
      if (finishReason !== "tool_calls" || accumulatedToolCalls.length === 0) {
        const codeExecutions2 = toolCalls.filter((tc) => tc.tool === "execute_code" || tc.tool === "write_and_run_code" || tc.tool === "fix_code" && tc.executed).map((tc) => ({
          code: tc.code || tc.fixedCode,
          purpose: this._slugify(tc.purpose),
          output: tc.stdout || "",
          stderr: tc.stderr || "",
          exitCode: tc.exitCode ?? 0
        }));
        yield { type: "done", fullText, codeExecutions: codeExecutions2, toolCalls, usage: this.getLastUsage() };
        return;
      }
      const toolResults = [];
      for (const tc of accumulatedToolCalls) {
        if (this._stopped) break;
        const parsedArgs = JSON.parse(tc.arguments);
        const toolName = tc.name;
        if (toolName === "write_code") {
          yield { type: "write", code: parsedArgs.code, purpose: parsedArgs.purpose, language: parsedArgs.language || "javascript" };
        } else if (toolName === "fix_code") {
          yield { type: "fix", originalCode: parsedArgs.original_code, fixedCode: parsedArgs.fixed_code, explanation: parsedArgs.explanation };
        } else if (toolName === "run_bash") {
          yield { type: "bash", command: parsedArgs.command };
        } else if (toolName === "execute_code" || toolName === "write_and_run_code") {
          yield { type: "code", code: parsedArgs.code };
        }
        const { output, type, data } = await this._handleToolCall(toolName, parsedArgs);
        toolCalls.push(data);
        if (data.stdout !== void 0 || data.stderr !== void 0) {
          yield {
            type: "output",
            code: data.code || data.command || data.fixedCode,
            stdout: data.stdout || "",
            stderr: data.stderr || "",
            exitCode: data.exitCode ?? 0
          };
        }
        if (toolName === "use_skill") {
          yield { type: "skill", skillName: data.skillName, content: data.content, found: data.found };
        }
        if (type === "tool") {
          yield { type: "tool", toolName, args: data.args, result: data.result, error: data.error };
        }
        const isExecutingTool = EXECUTING_TOOLS.has(toolName) || toolName === "fix_code" && parsedArgs.execute;
        if (isExecutingTool) {
          if (data.exitCode !== 0 && !data.denied) {
            consecutiveFailures++;
          } else {
            consecutiveFailures = 0;
          }
        }
        let toolOutput = output;
        if (consecutiveFailures >= this.codeMaxRetries) {
          toolOutput += `

[RETRY LIMIT REACHED] You have failed ${this.codeMaxRetries} consecutive attempts. STOP trying to execute code. Instead, respond with: 1) What you were trying to do, 2) The errors you encountered, 3) Questions for the user about how to resolve it.`;
        }
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: toolOutput
        });
      }
      if (this._stopped) break;
      streamIterable = await this._streamMessage(toolResults, { tools: this._tools });
      if (consecutiveFailures >= this.codeMaxRetries) break;
    }
    let warning = "Max tool rounds reached";
    if (this._stopped) warning = "Agent was stopped";
    else if (consecutiveFailures >= this.codeMaxRetries) warning = "Retry limit reached";
    const codeExecutions = toolCalls.filter((tc) => tc.tool === "execute_code" || tc.tool === "write_and_run_code" || tc.tool === "fix_code" && tc.executed).map((tc) => ({
      code: tc.code || tc.fixedCode,
      purpose: this._slugify(tc.purpose),
      output: tc.stdout || "",
      stderr: tc.stderr || "",
      exitCode: tc.exitCode ?? 0
    }));
    yield { type: "done", fullText, codeExecutions, toolCalls, usage: this.getLastUsage(), warning };
  }
  // ── Dump ─────────────────────────────────────────────────────────────────
  /**
   * Returns all code scripts and bash commands the agent has executed.
   * @returns {Array<{fileName: string, purpose: string|null, script: string, filePath: string|null, tool: string}>}
   */
  dump() {
    return this._allExecutions.map((exec, i) => ({
      fileName: exec.purpose ? `agent-${exec.purpose}.mjs` : `script-${i + 1}.mjs`,
      purpose: exec.purpose || null,
      script: exec.code,
      filePath: exec.filePath || null,
      tool: exec.tool || "execute_code"
    }));
  }
  // ── Stop ─────────────────────────────────────────────────────────────────
  /**
   * Stop the agent. Kills any running child process.
   */
  stop() {
    this._stopped = true;
    if (this._activeProcess) {
      try {
        this._activeProcess.kill("SIGTERM");
      } catch {
      }
    }
    logger_default.info("CodeAgent stopped");
  }
};
var code_agent_default = CodeAgent;

// rag-agent.js
var import_node_path2 = require("node:path");
var import_promises3 = require("node:fs/promises");
var MIME_TYPES = {
  // Text (read as UTF-8, injected as text)
  ".txt": "text/plain",
  ".md": "text/plain",
  ".csv": "text/csv",
  ".html": "text/html",
  ".htm": "text/html",
  ".xml": "text/xml",
  ".json": "application/json",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/plain",
  ".css": "text/css",
  ".yaml": "text/plain",
  ".yml": "text/plain",
  ".py": "text/x-python",
  ".rb": "text/plain",
  ".sh": "text/plain",
  // Images (base64 encoded for OpenAI vision)
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  // Documents (not natively supported by OpenAI as content blocks)
  ".pdf": "application/pdf"
};
var DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant. Answer questions based on the provided documents and data. When referencing information, mention which document or data source it comes from.";
var RagAgent = class extends base_default {
  /**
   * @param {Object} [options={}]
   */
  constructor(options = {}) {
    if (options.systemPrompt === void 0) {
      options = { ...options, systemPrompt: DEFAULT_SYSTEM_PROMPT };
    }
    super(options);
    this.localFiles = options.localFiles || [];
    this.localData = options.localData || [];
    this.mediaFiles = options.mediaFiles || [];
    this._localFileContents = [];
    this._mediaContentParts = [];
    const total = this.localFiles.length + this.localData.length + this.mediaFiles.length;
    logger_default.debug(`RagAgent created with ${total} context sources`);
  }
  // ── Initialization ───────────────────────────────────────────────────────
  /**
   * Reads local files, encodes media, and seeds all context into conversation.
   * @param {boolean} [force=false]
   * @returns {Promise<void>}
   */
  async init(force = false) {
    if (this._initialized && !force) return;
    await this._ensureClient();
    this._localFileContents = [];
    for (const filePath of this.localFiles) {
      const resolvedPath = (0, import_node_path2.resolve)(filePath);
      logger_default.debug(`Reading local file: ${resolvedPath}`);
      const content = await (0, import_promises3.readFile)(resolvedPath, "utf-8");
      this._localFileContents.push({
        name: (0, import_node_path2.basename)(resolvedPath),
        content,
        path: resolvedPath
      });
      logger_default.debug(`Local file read: ${(0, import_node_path2.basename)(resolvedPath)} (${content.length} chars)`);
    }
    this._mediaContentParts = [];
    for (const filePath of this.mediaFiles) {
      const resolvedPath = (0, import_node_path2.resolve)(filePath);
      const ext = (0, import_node_path2.extname)(resolvedPath).toLowerCase();
      const mimeType = MIME_TYPES[ext] || "application/octet-stream";
      logger_default.debug(`Encoding media file: ${resolvedPath} (${mimeType})`);
      const buffer = await (0, import_promises3.readFile)(resolvedPath);
      const base64 = buffer.toString("base64");
      if (mimeType.startsWith("image/")) {
        this._mediaContentParts.push({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64}` }
        });
      } else if (mimeType === "application/pdf") {
        logger_default.warn(`PDF files are not natively supported as content blocks by OpenAI. Skipping: ${(0, import_node_path2.basename)(resolvedPath)}`);
        continue;
      }
      logger_default.debug(`Media file encoded: ${(0, import_node_path2.basename)(resolvedPath)}`);
    }
    const textParts = [];
    for (const lf of this._localFileContents) {
      textParts.push(`--- File: ${lf.name} ---
${lf.content}`);
    }
    for (const ld of this.localData) {
      const serialized = typeof ld.data === "string" ? ld.data : JSON.stringify(ld.data, null, 2);
      textParts.push(`--- Data: ${ld.name} ---
${serialized}`);
    }
    const hasMedia = this._mediaContentParts.length > 0;
    const hasText = textParts.length > 0;
    if (hasMedia || hasText) {
      const contextLabel = "Here are the documents and data to analyze.";
      if (hasMedia) {
        const contentParts = [...this._mediaContentParts];
        const fullText = hasText ? textParts.join("\n\n") + "\n\n" + contextLabel : contextLabel;
        contentParts.push({ type: "text", text: fullText });
        this.history = [
          { role: "user", content: contentParts },
          { role: "assistant", content: "I have reviewed all the provided documents and data. I am ready to answer your questions about them." }
        ];
      } else {
        const fullText = textParts.join("\n\n") + "\n\n" + contextLabel;
        this.history = [
          { role: "user", content: fullText },
          { role: "assistant", content: "I have reviewed all the provided documents and data. I am ready to answer your questions about them." }
        ];
      }
    }
    this._initialized = true;
    logger_default.debug(`RagAgent initialized with ${this._localFileContents.length} local files, ${this.localData.length} data entries, ${this._mediaContentParts.length} media files`);
  }
  // ── Non-Streaming Chat ───────────────────────────────────────────────────
  /**
   * Send a message and get a response grounded in the loaded context.
   *
   * @param {string} message - The user's question
   * @param {Object} [opts={}]
   * @returns {Promise<{ text: string, usage: Object|null }>}
   */
  async chat(message, opts = {}) {
    if (!this._initialized) await this.init();
    const response = await this._sendMessage(message, opts);
    this._cumulativeUsage = {
      promptTokens: this.lastResponseMetadata.promptTokens,
      responseTokens: this.lastResponseMetadata.responseTokens,
      totalTokens: this.lastResponseMetadata.totalTokens,
      attempts: 1
    };
    return {
      text: this._extractText(response),
      usage: this.getLastUsage()
    };
  }
  // ── Streaming ────────────────────────────────────────────────────────────
  /**
   * Send a message and stream the response as events.
   *
   * @param {string} message - The user's question
   * @param {Object} [opts={}]
   * @yields {{ type: string, text?: string, fullText?: string, usage?: Object|null }}
   */
  async *stream(message, opts = {}) {
    if (!this._initialized) await this.init();
    let fullText = "";
    const streamIterable = await this._streamMessage(message, opts);
    for await (const chunk of streamIterable) {
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        fullText += delta.content;
        yield { type: "text", text: delta.content };
      }
      if (chunk.usage) {
        this.lastResponseMetadata = {
          modelVersion: chunk.model || null,
          requestedModel: this.modelName,
          promptTokens: chunk.usage.prompt_tokens || 0,
          responseTokens: chunk.usage.completion_tokens || 0,
          totalTokens: chunk.usage.total_tokens || 0,
          stopReason: chunk.choices?.[0]?.finish_reason || null,
          timestamp: Date.now()
        };
      }
    }
    this.history.push({ role: "assistant", content: fullText });
    yield {
      type: "done",
      fullText,
      usage: this.getLastUsage()
    };
  }
  // ── Context Management ──────────────────────────────────────────────────
  /**
   * Add local text files (read from disk). Triggers reinitialize.
   * @param {string[]} paths
   * @returns {Promise<void>}
   */
  async addLocalFiles(paths) {
    this.localFiles.push(...paths);
    await this.init(true);
  }
  /**
   * Add in-memory data entries. Triggers reinitialize.
   * @param {Array<{ name: string, data: any }>} entries
   * @returns {Promise<void>}
   */
  async addLocalData(entries) {
    this.localData.push(...entries);
    await this.init(true);
  }
  /**
   * Add media files (images). Triggers reinitialize.
   * Note: PDFs are not supported by OpenAI as content blocks and will be skipped.
   * @param {string[]} paths
   * @returns {Promise<void>}
   */
  async addMediaFiles(paths) {
    this.mediaFiles.push(...paths);
    await this.init(true);
  }
  /**
   * Returns metadata about all context sources.
   * @returns {{ localFiles: Array<Object>, localData: Array<Object>, mediaFiles: Array<Object> }}
   */
  getContext() {
    return {
      localFiles: this._localFileContents.map((lf) => ({
        name: lf.name,
        path: lf.path,
        size: lf.content.length
      })),
      localData: this.localData.map((ld) => ({
        name: ld.name,
        type: typeof ld.data === "object" && ld.data !== null ? Array.isArray(ld.data) ? "array" : "object" : typeof ld.data
      })),
      mediaFiles: this.mediaFiles.map((f) => ({
        path: (0, import_node_path2.resolve)(f),
        name: (0, import_node_path2.basename)(f),
        ext: (0, import_node_path2.extname)(f).toLowerCase()
      }))
    };
  }
};
var rag_agent_default = RagAgent;

// index.js
var index_default = { Transformer: transformer_default, Chat: chat_default, Message: message_default, ToolAgent: tool_agent_default, CodeAgent: code_agent_default, RagAgent: rag_agent_default };
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BaseGPT,
  Chat,
  CodeAgent,
  Message,
  RagAgent,
  ToolAgent,
  Transformer,
  attemptJSONRecovery,
  extractJSON,
  log
});
