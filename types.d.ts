// ── Shared Types ─────────────────────────────────────────────────────────────

export interface ResponseMetadata {
  modelVersion: string | null;
  requestedModel: string;
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
  stopReason: string | null;
  timestamp: number;
}

export interface UsageData {
  /** CUMULATIVE input tokens across all retry attempts */
  promptTokens: number;
  /** CUMULATIVE output tokens across all retry attempts */
  responseTokens: number;
  /** CUMULATIVE total tokens across all retry attempts */
  totalTokens: number;
  /** Number of attempts (1 = first try success, 2+ = retries needed) */
  attempts: number;
  /** Actual model that responded (e.g., 'gpt-4o-2024-08-06') */
  modelVersion: string | null;
  /** Model you requested (e.g., 'gpt-4o') */
  requestedModel: string;
  /** Stop reason (e.g., 'stop', 'tool_calls', 'length') */
  stopReason: string | null;
  timestamp: number;
}

export interface TransformationExample {
  CONTEXT?: Record<string, unknown> | string;
  PROMPT?: Record<string, unknown>;
  ANSWER?: Record<string, unknown>;
  INPUT?: Record<string, unknown>;
  OUTPUT?: Record<string, unknown>;
  SYSTEM?: string;
  EXPLANATION?: string;
  [key: string]: any;
}

export type AsyncValidatorFunction = (payload: Record<string, unknown>) => Promise<unknown>;
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'none';

// ── Constructor Options ──────────────────────────────────────────────────────

export interface BaseGPTOptions {
  /** OpenAI model to use (default: 'gpt-4o') */
  modelName?: string;
  /** System prompt for the model (null or false to disable) */
  systemPrompt?: string | null | false;
  /** Log level (default: based on NODE_ENV) */
  logLevel?: LogLevel;

  // Authentication
  /** API key for OpenAI API (or OPENAI_API_KEY env var) */
  apiKey?: string;

  // Generation config
  /** Maximum output tokens (default: 8192) */
  maxTokens?: number;
  /** Temperature (default: 0.7). Not used with reasoning models. */
  temperature?: number;
  /** Top-P (default: 0.95). Not used with reasoning models. */
  topP?: number;

  /** Reasoning effort for o-series models (e.g., o3, o4-mini) */
  reasoningEffort?: 'low' | 'medium' | 'high';

  /** Max SDK-level retry attempts for 429 errors (default: 5) */
  maxRetries?: number;

  /** Run health check during init() (default: false) */
  healthCheck?: boolean;

  /** Enable OpenAI's web search tool (default: false) */
  enableWebSearch?: boolean;
  /** Configuration for the web search tool */
  webSearchConfig?: Record<string, any>;
}

export interface TransformerOptions extends BaseGPTOptions {
  /** Path to JSON file containing transformation examples */
  examplesFile?: string;
  /** Inline examples to seed the transformer */
  exampleData?: TransformationExample[];
  /** Key for source/input data in examples (default: 'PROMPT') */
  sourceKey?: string;
  /** Alias for sourceKey */
  promptKey?: string;
  /** Key for target/output data in examples (default: 'ANSWER') */
  targetKey?: string;
  /** Alias for targetKey */
  answerKey?: string;
  /** Key for context data in examples (default: 'CONTEXT') */
  contextKey?: string;
  /** Key for explanation data in examples (default: 'EXPLANATION') */
  explanationKey?: string;
  /** Key for system prompt overrides in examples (default: 'SYSTEM') */
  systemPromptKey?: string;
  /** Maximum retry attempts for validation failures (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  retryDelay?: number;
  /** If true, only JSON responses are allowed (default: true) */
  onlyJSON?: boolean;
  /** Global async validator function for response validation */
  asyncValidator?: AsyncValidatorFunction;
}

export interface ChatOptions extends BaseGPTOptions {
  // Chat uses base options only
}

export interface MessageOptions extends BaseGPTOptions {
  /** Response format: 'json' for structured output (system prompt fallback) */
  responseFormat?: 'json';
  /** JSON Schema for native structured output via response_format.json_schema. When provided, the API guarantees valid JSON matching this schema. */
  responseSchema?: Record<string, any>;
}

/**
 * Tool declaration — accepts OpenAI's native format ({ type: 'function', function: { name, description, parameters } })
 * or a flat format compatible with Claude/Gemini tools (auto-mapped to OpenAI format).
 */
export interface ToolDeclaration {
  /** OpenAI format: must be 'function' */
  type?: 'function';
  /** OpenAI format: nested function definition */
  function?: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
  /** Flat format: tool name */
  name?: string;
  /** Flat format: tool description */
  description?: string;
  /** Flat format: tool parameters schema */
  parameters?: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
  /** Alias: Claude format (auto-mapped to parameters) */
  input_schema?: any;
  /** Alias: Claude format (auto-mapped to parameters) */
  inputSchema?: any;
  /** Alias: Gemini format (auto-mapped to parameters) */
  parametersJsonSchema?: any;
}

export interface ToolChoiceAuto {
  type: 'auto';
}

export interface ToolChoiceAny {
  type: 'any';
}

export interface ToolChoiceTool {
  type: 'tool';
  name: string;
}

export interface ToolChoiceNone {
  type: 'none';
}

export type ToolChoice = ToolChoiceAuto | ToolChoiceAny | ToolChoiceTool | ToolChoiceNone | 'auto' | 'any' | 'none';

export interface ToolAgentOptions extends BaseGPTOptions {
  /** Tool declarations for the model */
  tools?: ToolDeclaration[];
  /** Function to execute tool calls: (toolName, args) => result */
  toolExecutor?: (toolName: string, args: Record<string, any>) => Promise<any>;
  /** Max tool-use loop iterations (default: 10) */
  maxToolRounds?: number;
  /** Callback fired when a tool is called */
  onToolCall?: (toolName: string, args: Record<string, any>) => void;
  /** Async callback before tool execution; return false to deny */
  onBeforeExecution?: (toolName: string, args: Record<string, any>) => Promise<boolean>;
  /** Tool choice configuration (default: auto). Maps to OpenAI's tool_choice. */
  toolChoice?: ToolChoice;
  /** Disable parallel tool use — forces sequential tool calls (default: false) */
  disableParallelToolUse?: boolean;
  /** Parallel tool execution: false = sequential, true = unlimited parallel, number = concurrency limit (default: true) */
  parallelToolCalls?: boolean | number;
}

export interface LocalDataEntry {
  /** Label shown to the model (e.g. "users", "config") */
  name: string;
  /** Any JSON-serializable value */
  data: any;
}

export interface RagAgentOptions extends BaseGPTOptions {
  /** Paths to local text files read from disk (md, json, csv, yaml, txt) */
  localFiles?: string[];
  /** In-memory data objects to include as context */
  localData?: LocalDataEntry[];
  /** Paths to media files (images) encoded as base64 for OpenAI vision */
  mediaFiles?: string[];
}

export interface CodeAgentOptions extends BaseGPTOptions {
  /** Working directory for code execution (default: process.cwd()) */
  workingDirectory?: string;
  /** Programming language for code execution: 'javascript' (default) or 'python' */
  language?: 'javascript' | 'python';
  /** Path to the Python binary (only used when language is 'python'; default: auto-detect python3/python) */
  pythonPath?: string;
  /** Max code execution loop iterations (default: 10) */
  maxRounds?: number;
  /** Per-execution timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Async callback before code/bash execution; return false to deny. Receives (content, toolName). */
  onBeforeExecution?: (content: string, toolName: string) => Promise<boolean> | boolean;
  /** Notification callback after code/bash execution */
  onCodeExecution?: (code: string, output: { stdout: string; stderr: string; exitCode: number }) => void;
  /** Files whose contents are included in the system prompt for project context */
  importantFiles?: string[];
  /** Directory for writing script files (default: '{workingDirectory}/tmp') */
  writeDir?: string;
  /** Keep script files on disk after execution (default: false) */
  keepArtifacts?: boolean;
  /** Instruct model to write JSDoc comments in generated code (default: false) */
  comments?: boolean;
  /** Max consecutive failed executions before stopping (default: 3) */
  maxRetries?: number;
  /** Paths to skill files (markdown) loaded dynamically via the use_skill tool */
  skills?: string[];
  /** Plain text environment overview appended to the system prompt — describe the project, stack, conventions, etc. */
  envOverview?: string;
  /** Custom tool declarations to add alongside built-in CodeAgent tools. Accepts OpenAI, Claude, or Gemini tool formats (auto-mapped). */
  tools?: ToolDeclaration[];
  /** Function to execute custom tool calls: (toolName, args) => result */
  toolExecutor?: (toolName: string, args: Record<string, any>) => Promise<any>;
}

export interface CodeExecution {
  code: string;
  purpose?: string;
  output: string;
  stderr: string;
  exitCode: number;
}

export interface ToolCallResult {
  tool: 'write_code' | 'execute_code' | 'write_and_run_code' | 'fix_code' | 'run_bash' | 'use_skill' | string;
  code?: string;
  purpose?: string;
  language?: string;
  originalCode?: string;
  fixedCode?: string;
  explanation?: string;
  executed?: boolean;
  command?: string;
  skillName?: string;
  content?: string;
  found?: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  denied?: boolean;
}

export interface CodeAgentResponse {
  text: string;
  /** Backward-compatible: only code executions (execute_code, write_and_run_code, fix_code with execute) */
  codeExecutions: CodeExecution[];
  /** All tool calls made during this chat turn */
  toolCalls: ToolCallResult[];
  usage: UsageData | null;
}

export interface CodeAgentStreamEvent {
  type: 'text' | 'code' | 'output' | 'write' | 'fix' | 'bash' | 'skill' | 'tool' | 'done';
  text?: string;
  code?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  fullText?: string;
  codeExecutions?: CodeExecution[];
  toolCalls?: ToolCallResult[];
  usage?: UsageData | null;
  warning?: string;
  purpose?: string;
  language?: string;
  originalCode?: string;
  fixedCode?: string;
  explanation?: string;
  command?: string;
  skillName?: string;
  content?: string;
  found?: boolean;
  /** custom tool: tool name */
  toolName?: string;
  /** custom tool: arguments passed */
  args?: Record<string, any>;
  /** custom tool: result returned */
  result?: any;
  /** custom tool: error message (if failed) */
  error?: string;
}

// ── Per-Message Options ──────────────────────────────────────────────────────

export interface SendOptions {
  /** Send without affecting chat history (Transformer only) */
  stateless?: boolean;
  /** Override max retries for this message */
  maxRetries?: number;
  /** Override retry delay for this message */
  retryDelay?: number;
  /** Override max tokens for this message */
  maxTokens?: number;
  [key: string]: any;
}

// ── Response Types ───────────────────────────────────────────────────────────

export interface ChatResponse {
  text: string;
  usage: UsageData | null;
}

export interface ChatStreamEvent {
  type: 'text' | 'done';
  text?: string;
  fullText?: string;
  usage?: UsageData | null;
}

export interface MessageResponse {
  text: string;
  data?: any;
  usage: UsageData | null;
}

export interface RagResponse {
  text: string;
  usage: UsageData | null;
}

export interface RagStreamEvent {
  type: 'text' | 'done';
  text?: string;
  fullText?: string;
  usage?: UsageData | null;
}

export interface AgentResponse {
  text: string;
  toolCalls: Array<{ name: string; args: Record<string, any>; result: any }>;
  usage: UsageData | null;
}

export interface AgentStreamEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'done';
  text?: string;
  toolName?: string;
  args?: Record<string, any>;
  result?: any;
  fullText?: string;
  usage?: UsageData | null;
  warning?: string;
}

// ── Seed Options ─────────────────────────────────────────────────────────────

export interface SeedOptions {
  promptKey?: string;
  answerKey?: string;
  contextKey?: string;
  explanationKey?: string;
  systemPromptKey?: string;
  /** Assistant-turn format: 'json' wraps answers in a {data} envelope (Transformer protocol); 'text' stores ANSWER verbatim (prose agents like Chat). Default: 'json' */
  format?: 'json' | 'text';
}

// ── Class Declarations ───────────────────────────────────────────────────────

export declare class BaseGPT {
  constructor(options?: BaseGPTOptions);

  modelName: string;
  systemPrompt: string | null | false;
  client: any;
  /** Raw SDK clients namespace for advanced use cases */
  clients: {
    /** OpenAI client instance */
    openai: any;
    /** Convenience pointer to the active client */
    raw: any;
  };
  history: any[];
  lastResponseMetadata: ResponseMetadata | null;
  exampleCount: number;
  maxTokens: number;
  temperature: number;
  topP: number;
  reasoningEffort: 'low' | 'medium' | 'high' | undefined;
  /** @internal Not exposed in options — always undefined for OpenAI */
  topK: number | undefined;
  enableWebSearch: boolean;
  webSearchConfig: Record<string, any>;

  /** @internal Ensures the OpenAI client is ready (called by subclasses) */
  _ensureClient(): Promise<void>;

  init(force?: boolean): Promise<void>;
  seed(examples?: TransformationExample[], opts?: SeedOptions): Promise<any[]>;
  getHistory(curated?: boolean): any[];
  clearHistory(): Promise<void>;
  getLastUsage(): UsageData | null;
  estimate(nextPayload: Record<string, unknown> | string): Promise<{ inputTokens: number }>;
  estimateCost(nextPayload: Record<string, unknown> | string): Promise<{
    inputTokens: number;
    model: string;
    pricing: { input: number; output: number };
    estimatedInputCost: number;
    note: string;
  }>;
  listModels(): AsyncGenerator<any, void, unknown>;
  getModel(modelId: string): Promise<any>;
}

export declare class Transformer extends BaseGPT {
  constructor(options?: TransformerOptions);

  promptKey: string;
  answerKey: string;
  contextKey: string;
  explanationKey: string;
  onlyJSON: boolean;
  asyncValidator: AsyncValidatorFunction | null;
  validationRetries: number;
  retryDelay: number;

  seed(examples?: TransformationExample[]): Promise<any[]>;
  send(payload: Record<string, unknown> | string, opts?: SendOptions, validatorFn?: AsyncValidatorFunction | null): Promise<Record<string, unknown>>;
  rawSend(payload: Record<string, unknown> | string): Promise<Record<string, unknown>>;
  rebuild(lastPayload: Record<string, unknown>, serverError: string): Promise<Record<string, unknown>>;
  reset(): Promise<void>;
  updateSystemPrompt(newPrompt: string): Promise<void>;
}

export declare class Chat extends BaseGPT {
  constructor(options?: ChatOptions);

  send(message: string, opts?: Record<string, any>): Promise<ChatResponse>;
  stream(message: string, opts?: Record<string, any>): AsyncGenerator<ChatStreamEvent, void, unknown>;
}

export declare class Message extends BaseGPT {
  constructor(options?: MessageOptions);

  init(force?: boolean): Promise<void>;
  send(payload: Record<string, unknown> | string, opts?: Record<string, any>): Promise<MessageResponse>;
}

export declare class ToolAgent extends BaseGPT {
  constructor(options?: ToolAgentOptions);

  tools: ToolDeclaration[];
  toolExecutor: ((toolName: string, args: Record<string, any>) => Promise<any>) | null;
  maxToolRounds: number;
  onToolCall: ((toolName: string, args: Record<string, any>) => void) | null;
  onBeforeExecution: ((toolName: string, args: Record<string, any>) => Promise<boolean>) | null;
  toolChoice: ToolChoice | undefined;
  disableParallelToolUse: boolean;
  parallelToolCalls: boolean | number;

  chat(message: string, opts?: Record<string, any>): Promise<AgentResponse>;
  stream(message: string, opts?: Record<string, any>): AsyncGenerator<AgentStreamEvent, void, unknown>;
  stop(): void;
}

export declare class RagAgent extends BaseGPT {
  constructor(options?: RagAgentOptions);

  localFiles: string[];
  localData: LocalDataEntry[];
  mediaFiles: string[];

  init(force?: boolean): Promise<void>;
  chat(message: string, opts?: Record<string, any>): Promise<RagResponse>;
  stream(message: string, opts?: Record<string, any>): AsyncGenerator<RagStreamEvent, void, unknown>;
  addLocalFiles(paths: string[]): Promise<void>;
  addLocalData(entries: LocalDataEntry[]): Promise<void>;
  addMediaFiles(paths: string[]): Promise<void>;
  getContext(): {
    localFiles: Array<{ name: string; path: string; size: number }>;
    localData: Array<{ name: string; type: string }>;
    mediaFiles: Array<{ path: string; name: string; ext: string }>;
  };
}

export declare class CodeAgent extends BaseGPT {
  constructor(options?: CodeAgentOptions);

  workingDirectory: string;
  language: 'javascript' | 'python';
  pythonPath: string | null;
  maxRounds: number;
  timeout: number;
  onBeforeExecution: ((content: string, toolName: string) => Promise<boolean> | boolean) | null;
  onCodeExecution: ((code: string, output: { stdout: string; stderr: string; exitCode: number }) => void) | null;
  importantFiles: string[];
  writeDir: string;
  keepArtifacts: boolean;
  comments: boolean;
  codeMaxRetries: number;
  skills: string[];
  envOverview: string;
  customTools: Array<{ type: string; function: { name: string; description: string; parameters: any } }>;
  toolExecutor: ((toolName: string, args: Record<string, any>) => Promise<any>) | null;

  init(force?: boolean): Promise<void>;
  chat(message: string, opts?: Record<string, any>): Promise<CodeAgentResponse>;
  stream(message: string, opts?: Record<string, any>): AsyncGenerator<CodeAgentStreamEvent, void, unknown>;
  dump(): Array<{ fileName: string; purpose: string | null; script: string; filePath: string | null; tool: string }>;
  stop(): void;
}

// ── Module Exports ───────────────────────────────────────────────────────────

export declare function extractJSON(text: string): any;
export declare function attemptJSONRecovery(text: string, maxAttempts?: number): any | null;

declare const _default: {
  Transformer: typeof Transformer;
  Chat: typeof Chat;
  Message: typeof Message;
  ToolAgent: typeof ToolAgent;
  CodeAgent: typeof CodeAgent;
  RagAgent: typeof RagAgent;
};

export default _default;
