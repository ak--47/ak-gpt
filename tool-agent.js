/**
 * @fileoverview ToolAgent class — AI agent with user-provided tools.
 * Extends BaseGPT with automatic tool-use loops for both streaming
 * and non-streaming conversations.
 *
 * OpenAI's tool-use flow:
 * 1. Send message with tools[] array
 * 2. Response has finish_reason: 'tool_calls' and message.tool_calls[]
 * 3. Execute tools, send back role: 'tool' messages with tool_call_id
 * 4. Repeat until finish_reason: 'stop'
 */

import BaseGPT from './base.js';
import log from './logger.js';

/**
 * @typedef {import('./types').ToolAgentOptions} ToolAgentOptions
 * @typedef {import('./types').AgentResponse} AgentResponse
 * @typedef {import('./types').AgentStreamEvent} AgentStreamEvent
 */

/**
 * Execute async task factories with a concurrency limit.
 * @param {Array<() => Promise<any>>} tasks
 * @param {number} concurrency - Infinity for unlimited, 1 for sequential
 * @returns {Promise<any[]>} Results in same order as tasks
 */
async function runWithConcurrency(tasks, concurrency) {
	if (concurrency === Infinity) return Promise.all(tasks.map(t => t()));
	if (concurrency === 1) {
		const results = [];
		for (const t of tasks) results.push(await t());
		return results;
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

/**
 * AI agent that uses user-provided tools to accomplish tasks.
 * Automatically manages the tool-use loop: when the model decides to call
 * a tool, the agent executes it via your toolExecutor, sends the result back,
 * and continues until the model produces a final text response.
 *
 * Ships with zero built-in tools — you provide everything via the constructor.
 *
 * @example
 * ```javascript
 * import { ToolAgent } from 'ak-gpt';
 *
 * const agent = new ToolAgent({
 *   systemPrompt: 'You are a research assistant.',
 *   tools: [
 *     {
 *       name: 'http_get',
 *       description: 'Fetch a URL and return its contents',
 *       parameters: {
 *         type: 'object',
 *         properties: { url: { type: 'string', description: 'The URL to fetch' } },
 *         required: ['url']
 *       }
 *     }
 *   ],
 *   toolExecutor: async (toolName, args) => {
 *     if (toolName === 'http_get') {
 *       const res = await fetch(args.url);
 *       return { status: res.status, body: await res.text() };
 *     }
 *     throw new Error(`Unknown tool: ${toolName}`);
 *   }
 * });
 *
 * const result = await agent.chat('Fetch https://api.example.com/data and summarize it');
 * console.log(result.text);      // Agent's summary
 * console.log(result.toolCalls); // [{ name: 'http_get', args: {...}, result: {...} }]
 * ```
 */
class ToolAgent extends BaseGPT {
	/**
	 * @param {ToolAgentOptions} [options={}]
	 */
	constructor(options = {}) {
		if (options.systemPrompt === undefined) {
			options = { ...options, systemPrompt: 'You are a helpful AI assistant.' };
		}

		super(options);

		// ── Tools ──
		// Accept tools in any format and normalize to OpenAI's format:
		// { type: 'function', function: { name, description, parameters } }
		this.tools = (options.tools || []).map(t => {
			// Already OpenAI format
			if (t.type === 'function' && t.function) return t;
			// Convert from Claude/Gemini flat format
			return {
				type: 'function',
				function: {
					name: t.name,
					description: t.description || '',
					parameters: t.parameters || t.input_schema || t.inputSchema || t.parametersJsonSchema || { type: 'object', properties: {} }
				}
			};
		});
		this.toolExecutor = options.toolExecutor || null;

		// Validate: if tools provided, executor is required (and vice versa)
		if (this.tools.length > 0 && !this.toolExecutor) {
			throw new Error("ToolAgent: tools provided without a toolExecutor. Provide a toolExecutor function to handle tool calls.");
		}
		if (this.toolExecutor && this.tools.length === 0) {
			throw new Error("ToolAgent: toolExecutor provided without tools. Provide tool declarations so the model knows what tools are available.");
		}

		// ── Tool choice ──
		this.toolChoice = options.toolChoice ?? undefined;
		this.disableParallelToolUse = options.disableParallelToolUse ?? false;

		// ── Parallel execution ──
		this.parallelToolCalls = options.parallelToolCalls ?? true;
		/** @private */
		this._concurrency = this.parallelToolCalls === true ? Infinity
			: this.parallelToolCalls === false ? 1
			: this.parallelToolCalls;

		// ── Tool loop config ──
		this.maxToolRounds = options.maxToolRounds || 10;
		this.onToolCall = options.onToolCall || null;
		this.onBeforeExecution = options.onBeforeExecution || null;
		this._stopped = false;

		log.debug(`ToolAgent created with ${this.tools.length} tools`);
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
		if (!choice && !this.disableParallelToolUse) return undefined;

		// Default to auto if only disableParallelToolUse is set
		if (!choice) choice = 'auto';

		// Normalize string shortcuts
		if (typeof choice === 'string') {
			if (choice === 'auto') return 'auto';
			if (choice === 'any') return 'required';
			if (choice === 'none') return 'none';
			return choice;
		}

		// Object format
		if (choice.type === 'auto') return 'auto';
		if (choice.type === 'any') return 'required';
		if (choice.type === 'none') return 'none';
		if (choice.type === 'tool' && choice.name) {
			return { type: 'function', function: { name: choice.name } };
		}

		return undefined;
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
			...(toolChoice && { tool_choice: toolChoice }),
			...(this.disableParallelToolUse && { parallel_tool_calls: false })
		};
		let response = await this._sendMessage(message, sendOpts);

		for (let round = 0; round < this.maxToolRounds; round++) {
			if (this._stopped) break;
			if (response.choices[0].finish_reason !== 'tool_calls') break;

			// Extract tool_calls from assistant message
			const toolCallBlocks = response.choices[0].message.tool_calls;
			if (!toolCallBlocks || toolCallBlocks.length === 0) break;

			// Execute tools (parallel or sequential based on _concurrency)
			const tasks = toolCallBlocks.map(tc => async () => {
				const args = JSON.parse(tc.function.arguments);

				// Fire onToolCall callback
				if (this.onToolCall) {
					try { this.onToolCall(tc.function.name, args); }
					catch (e) { log.warn(`onToolCall callback error: ${e.message}`); }
				}

				// Check onBeforeExecution gate
				if (this.onBeforeExecution) {
					try {
						const allowed = await this.onBeforeExecution(tc.function.name, args);
						if (allowed === false) {
							const result = { error: 'Execution denied by onBeforeExecution callback' };
							return {
								toolCall: { name: tc.function.name, args, result },
								toolResult: { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) }
							};
						}
					} catch (e) {
						log.warn(`onBeforeExecution callback error: ${e.message}`);
					}
				}

				let result;
				try {
					result = await this.toolExecutor(tc.function.name, args);
				} catch (err) {
					log.warn(`Tool ${tc.function.name} failed: ${err.message}`);
					result = { error: err.message };
				}

				return {
					toolCall: { name: tc.function.name, args, result },
					toolResult: { role: 'tool', tool_call_id: tc.id, content: typeof result === 'string' ? result : JSON.stringify(result) }
				};
			});

			const results = await runWithConcurrency(tasks, this._concurrency);
			const toolMessages = results.map(r => r.toolResult);
			for (const r of results) allToolCalls.push(r.toolCall);

			// Send tool results back — base class handles pushing each tool message to history
			response = await this._sendMessage(toolMessages, sendOpts);
		}

		// Set cumulative usage
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
		let fullText = '';

		const toolChoice = this._buildToolChoice();
		const sendOpts = {
			tools: this.tools,
			...(toolChoice && { tool_choice: toolChoice }),
			...(this.disableParallelToolUse && { parallel_tool_calls: false })
		};

		// First round: send user message and get stream
		/** @type {string|Array} */
		let currentMessage = message;

		for (let round = 0; round <= this.maxToolRounds; round++) {
			if (this._stopped) break;

			const streamIterable = await this._streamMessage(currentMessage, sendOpts);

			// Accumulate the streamed response
			let fullContent = '';
			let toolCallsAccum = {};  // keyed by index
			let finishReason = null;
			let usage = null;

			for await (const chunk of streamIterable) {
				const delta = chunk.choices?.[0]?.delta;
				if (delta?.content) {
					fullContent += delta.content;
					fullText += delta.content;
					yield { type: 'text', text: delta.content };
				}
				if (delta?.tool_calls) {
					for (const tc of delta.tool_calls) {
						if (!toolCallsAccum[tc.index]) toolCallsAccum[tc.index] = { id: '', name: '', arguments: '' };
						if (tc.id) toolCallsAccum[tc.index].id = tc.id;
						if (tc.function?.name) toolCallsAccum[tc.index].name += tc.function.name;
						if (tc.function?.arguments) toolCallsAccum[tc.index].arguments += tc.function.arguments;
					}
				}
				if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
				if (chunk.usage) usage = chunk.usage;
			}

			// Reconstruct full assistant message and push to history
			const assistantMsg = { role: 'assistant', content: fullContent || null };
			const toolCalls = Object.values(toolCallsAccum);
			if (toolCalls.length > 0) {
				assistantMsg.tool_calls = toolCalls.map(tc => ({
					id: tc.id,
					type: 'function',
					function: { name: tc.name, arguments: tc.arguments }
				}));
			}
			this.history.push(assistantMsg);

			// Capture usage metadata if available
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

			// No tool calls — we're done
			if (finishReason !== 'tool_calls' || toolCalls.length === 0) {
				yield {
					type: 'done',
					fullText,
					usage: this.getLastUsage()
				};
				return;
			}

			// Execute tools and yield events
			const toolResults = [];
			if (this._concurrency === 1) {
				// Sequential: yield tool_call, execute, yield tool_result for each
				for (const tc of toolCalls) {
					if (this._stopped) break;

					const args = JSON.parse(tc.arguments);
					yield { type: 'tool_call', toolName: tc.name, args };

					if (this.onToolCall) {
						try { this.onToolCall(tc.name, args); }
						catch (e) { log.warn(`onToolCall callback error: ${e.message}`); }
					}

					let denied = false;
					if (this.onBeforeExecution) {
						try {
							const allowed = await this.onBeforeExecution(tc.name, args);
							if (allowed === false) denied = true;
						} catch (e) {
							log.warn(`onBeforeExecution callback error: ${e.message}`);
						}
					}

					let result;
					if (denied) {
						result = { error: 'Execution denied by onBeforeExecution callback' };
					} else {
						try {
							result = await this.toolExecutor(tc.name, args);
						} catch (err) {
							log.warn(`Tool ${tc.name} failed: ${err.message}`);
							result = { error: err.message };
						}
					}

					allToolCalls.push({ name: tc.name, args, result });
					yield { type: 'tool_result', toolName: tc.name, result };

					toolResults.push({
						role: 'tool',
						tool_call_id: tc.id,
						content: typeof result === 'string' ? result : JSON.stringify(result)
					});
				}
			} else {
				// Parallel: yield all tool_call events, execute all, yield all tool_result events
				const parsedCalls = toolCalls.map(tc => ({ ...tc, parsedArgs: JSON.parse(tc.arguments) }));

				for (const tc of parsedCalls) {
					yield { type: 'tool_call', toolName: tc.name, args: tc.parsedArgs };
				}

				const tasks = parsedCalls.map(tc => async () => {
					if (this.onToolCall) {
						try { this.onToolCall(tc.name, tc.parsedArgs); }
						catch (e) { log.warn(`onToolCall callback error: ${e.message}`); }
					}

					let denied = false;
					if (this.onBeforeExecution) {
						try {
							const allowed = await this.onBeforeExecution(tc.name, tc.parsedArgs);
							if (allowed === false) denied = true;
						} catch (e) {
							log.warn(`onBeforeExecution callback error: ${e.message}`);
						}
					}

					let result;
					if (denied) {
						result = { error: 'Execution denied by onBeforeExecution callback' };
					} else {
						try {
							result = await this.toolExecutor(tc.name, tc.parsedArgs);
						} catch (err) {
							log.warn(`Tool ${tc.name} failed: ${err.message}`);
							result = { error: err.message };
						}
					}

					return {
						toolCall: { name: tc.name, args: tc.parsedArgs, result },
						toolResult: {
							role: 'tool',
							tool_call_id: tc.id,
							content: typeof result === 'string' ? result : JSON.stringify(result)
						}
					};
				});

				const results = await runWithConcurrency(tasks, this._concurrency);
				for (const r of results) {
					allToolCalls.push(r.toolCall);
					yield { type: 'tool_result', toolName: r.toolCall.name, result: r.toolCall.result };
					toolResults.push(r.toolResult);
				}
			}

			// Send tool results back for the next round
			currentMessage = toolResults;
		}

		// Max rounds reached or stopped
		yield {
			type: 'done',
			fullText,
			usage: this.getLastUsage(),
			warning: this._stopped ? 'Agent was stopped' : 'Max tool rounds reached'
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
		log.info('ToolAgent stopped');
	}
}

export default ToolAgent;
