/**
 * @fileoverview Chat class — multi-turn text conversation with AI.
 * Extends BaseGPT with simple send/receive text messaging and conversation history.
 */

import BaseGPT from './base.js';
import log from './logger.js';

/**
 * Multi-turn text conversation with AI.
 * Maintains conversation history for contextual back-and-forth exchanges.
 * Returns plain text responses (not JSON).
 *
 * @example
 * ```javascript
 * import { Chat } from 'ak-gpt';
 *
 * const chat = new Chat({
 *   systemPrompt: 'You are a friendly tutor who explains concepts simply.'
 * });
 *
 * await chat.init();
 * const r1 = await chat.send('What is recursion?');
 * console.log(r1.text);
 *
 * const r2 = await chat.send('Can you give me an example in JavaScript?');
 * console.log(r2.text); // Remembers the recursion context
 * ```
 */
class Chat extends BaseGPT {
	/**
	 * @param {Object} [options={}]
	 */
	constructor(options = {}) {
		if (options.systemPrompt === undefined) {
			options = { ...options, systemPrompt: 'You are a helpful AI assistant.' };
		}

		super(options);

		log.debug(`Chat created with model: ${this.modelName}`);
	}

	/**
	 * Seeds the conversation with example pairs stored as plain prose turns.
	 * Chat is a prose agent — assistant turns are stored verbatim, not wrapped in
	 * Transformer's {data} JSON envelope.
	 *
	 * @param {import('./types').TransformationExample[]} [examples]
	 * @param {import('./types').SeedOptions} [opts={}]
	 * @returns {Promise<Array>} The updated history
	 */
	async seed(examples, opts = {}) {
		return super.seed(examples, { format: 'text', ...opts });
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

		// Set cumulative usage (single attempt for Chat)
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

		let fullText = '';
		const streamIterable = await this._streamMessage(message, opts);

		for await (const chunk of streamIterable) {
			const delta = chunk.choices?.[0]?.delta;
			if (delta?.content) {
				fullText += delta.content;
				yield { type: 'text', text: delta.content };
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

		this.history.push({ role: 'assistant', content: fullText });

		yield {
			type: 'done',
			fullText,
			usage: this.getLastUsage()
		};
	}
}

export default Chat;
