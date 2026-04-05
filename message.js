/**
 * @fileoverview Message class — stateless one-off messages to AI.
 * Uses client.chat.completions.create() directly without maintaining conversation history.
 */

import BaseGPT from './base.js';
import { extractJSON } from './json-helpers.js';
import log from './logger.js';

/**
 * Stateless one-off messages to AI.
 * Each send() call is independent — no conversation history is maintained.
 *
 * Optionally returns structured data via native structured outputs (responseSchema)
 * or JSON mode fallback (responseFormat: 'json').
 *
 * @example
 * ```javascript
 * import { Message } from 'ak-gpt';
 *
 * // Simple text response
 * const msg = new Message({
 *   systemPrompt: 'You are a helpful assistant.'
 * });
 * const r = await msg.send('What is the capital of France?');
 * console.log(r.text); // "The capital of France is Paris."
 *
 * // Native structured output (guaranteed valid JSON matching schema)
 * const schemaMsg = new Message({
 *   systemPrompt: 'Extract entities from text.',
 *   responseSchema: {
 *     type: 'object',
 *     properties: {
 *       entities: {
 *         type: 'array',
 *         items: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' } }, required: ['name', 'type'] }
 *       }
 *     },
 *     required: ['entities']
 *   }
 * });
 * const r2 = await schemaMsg.send('Alice works at Acme Corp in New York.');
 * console.log(r2.data); // { entities: [...] }
 *
 * // Fallback: JSON mode (no schema guarantee)
 * const jsonMsg = new Message({
 *   systemPrompt: 'Extract entities from text.',
 *   responseFormat: 'json'
 * });
 * const r3 = await jsonMsg.send('Alice works at Acme Corp in New York.');
 * console.log(r3.data); // { entities: [...] }
 * ```
 */
class Message extends BaseGPT {
	/**
	 * @param {Object} [options={}]
	 */
	constructor(options = {}) {
		super(options);

		this._responseSchema = options.responseSchema || null;
		this._isStructured = !!(this._responseSchema || options.responseFormat === 'json');

		log.debug(`Message created (structured=${this._isStructured}, nativeSchema=${!!this._responseSchema})`);
	}

	/**
	 * Initialize the Message client.
	 * Override: stateless, no history management needed.
	 * @param {boolean} [force=false]
	 * @returns {Promise<void>}
	 */
	async init(force = false) {
		if (this._initialized && !force) return;

		log.debug(`Initializing ${this.constructor.name} with model: ${this.modelName}...`);

		if (this.healthCheck) {
			try {
				await this.client.chat.completions.create({
					model: this.modelName,
					max_tokens: 1,
					messages: [{ role: 'user', content: 'hi' }]
				});
				log.debug(`${this.constructor.name}: API connection successful.`);
			} catch (e) {
				throw new Error(`${this.constructor.name} initialization failed: ${e.message}`);
			}
		}

		this._initialized = true;
		log.debug(`${this.constructor.name}: Initialized (stateless mode).`);
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

		const payloadStr = typeof payload === 'string'
			? payload
			: JSON.stringify(payload, null, 2);

		// Build messages array with system prompt
		const systemMessages = this._buildSystemMessages();

		// For JSON mode fallback (no native schema), augment system prompt with JSON instruction
		let messages;
		if (this._isStructured && !this._responseSchema) {
			const jsonInstruction = '\n\nAlways respond ONLY with valid JSON. No markdown code blocks, no preamble text.';
			if (systemMessages.length > 0) {
				messages = [
					...systemMessages.slice(0, -1),
					{ ...systemMessages[systemMessages.length - 1], content: systemMessages[systemMessages.length - 1].content + jsonInstruction },
					{ role: 'user', content: payloadStr }
				];
			} else {
				messages = [
					{ role: 'system', content: 'Always respond ONLY with valid JSON. No markdown code blocks, no preamble text.' },
					{ role: 'user', content: payloadStr }
				];
			}
		} else {
			messages = [...systemMessages, { role: 'user', content: payloadStr }];
		}

		/** @type {any} */
		const params = {
			model: this.modelName,
			messages,
		};

		// Reasoning model handling: use reasoning_effort + max_completion_tokens
		if (this.reasoningEffort) {
			params.reasoning_effort = this.reasoningEffort;
			params.max_completion_tokens = opts.maxTokens || this.maxTokens;
			// temperature and topP are not supported with reasoning models
		} else {
			params.max_tokens = opts.maxTokens || this.maxTokens;
			if (this.temperature !== undefined) params.temperature = this.temperature;
			if (this.topP !== undefined) params.top_p = this.topP;
		}

		// Native structured output via JSON Schema
		if (this._responseSchema) {
			params.response_format = {
				type: 'json_schema',
				json_schema: {
					name: 'response',
					strict: true,
					schema: this._responseSchema
				}
			};
		} else if (this._isStructured) {
			// Fallback: JSON mode without schema guarantee
			params.response_format = { type: 'json_object' };
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

		// Parse structured data if configured
		if (this._isStructured) {
			try {
				if (this._responseSchema) {
					// Native structured output — guaranteed valid JSON
					result.data = JSON.parse(text);
				} else {
					// Fallback — extract JSON from potentially messy text
					result.data = extractJSON(text);
				}
			} catch (e) {
				log.warn(`Could not parse structured response: ${e.message}`);
				result.data = null;
			}
		}

		return result;
	}

	// ── No-ops for stateless class ──

	/** @returns {Array} Always returns empty array (stateless). */
	getHistory() { return []; }

	/** No-op (stateless). */
	async clearHistory() { }

	/** Not supported on Message (stateless). */
	async seed() {
		log.warn("Message is stateless — seed() has no effect. Use Transformer or Chat for few-shot learning.");
		return [];
	}
}

export default Message;
