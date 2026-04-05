/**
 * @fileoverview RagAgent class — AI agent for document & data Q&A.
 *
 * NOTE: This is not true RAG (no vector embeddings, chunking, or similarity
 * search). It uses long-context injection — all content is placed directly
 * into the model's context window. Named "RagAgent" because it serves the
 * same purpose in spirit: grounding AI responses in user-provided data.
 *
 * Supports three input types:
 * - localFiles: read from disk as text (md, json, csv, yaml, txt, etc.)
 * - localData: in-memory objects serialized as JSON
 * - mediaFiles: images encoded as base64 content parts (OpenAI vision)
 */

import { resolve, basename, extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import BaseGPT from './base.js';
import log from './logger.js';

/** @type {Record<string, string>} */
const MIME_TYPES = {
	// Text (read as UTF-8, injected as text)
	'.txt': 'text/plain', '.md': 'text/plain', '.csv': 'text/csv',
	'.html': 'text/html', '.htm': 'text/html', '.xml': 'text/xml',
	'.json': 'application/json', '.js': 'text/javascript', '.mjs': 'text/javascript',
	'.ts': 'text/plain', '.css': 'text/css', '.yaml': 'text/plain', '.yml': 'text/plain',
	'.py': 'text/x-python', '.rb': 'text/plain', '.sh': 'text/plain',
	// Images (base64 encoded for OpenAI vision)
	'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
	'.gif': 'image/gif', '.webp': 'image/webp',
	// Documents (not natively supported by OpenAI as content blocks)
	'.pdf': 'application/pdf',
};

const DEFAULT_SYSTEM_PROMPT =
	'You are a helpful AI assistant. Answer questions based on the provided documents and data. ' +
	'When referencing information, mention which document or data source it comes from.';

/**
 * AI agent that answers questions grounded in user-provided documents and data.
 *
 * @example
 * ```javascript
 * import { RagAgent } from 'ak-gpt';
 *
 * const agent = new RagAgent({
 *   localFiles: ['./docs/api.md', './config.yaml'],
 *   localData: [
 *     { name: 'users', data: [{ id: 1, name: 'Alice' }] },
 *   ],
 *   mediaFiles: ['./diagram.png'],
 * });
 *
 * const result = await agent.chat('What does the API doc say about auth?');
 * console.log(result.text);
 * ```
 */
class RagAgent extends BaseGPT {
	/**
	 * @param {Object} [options={}]
	 */
	constructor(options = {}) {
		if (options.systemPrompt === undefined) {
			options = { ...options, systemPrompt: DEFAULT_SYSTEM_PROMPT };
		}

		super(options);

		this.localFiles = options.localFiles || [];
		this.localData = options.localData || [];
		this.mediaFiles = options.mediaFiles || [];
		this._localFileContents = [];
		this._mediaContentParts = [];

		const total = this.localFiles.length + this.localData.length + this.mediaFiles.length;
		log.debug(`RagAgent created with ${total} context sources`);
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

		// 1. Read local text files from disk
		this._localFileContents = [];
		for (const filePath of this.localFiles) {
			const resolvedPath = resolve(filePath);
			log.debug(`Reading local file: ${resolvedPath}`);

			const content = await readFile(resolvedPath, 'utf-8');
			this._localFileContents.push({
				name: basename(resolvedPath),
				content,
				path: resolvedPath
			});

			log.debug(`Local file read: ${basename(resolvedPath)} (${content.length} chars)`);
		}

		// 2. Encode media files as base64 content parts
		this._mediaContentParts = [];
		for (const filePath of this.mediaFiles) {
			const resolvedPath = resolve(filePath);
			const ext = extname(resolvedPath).toLowerCase();
			const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

			log.debug(`Encoding media file: ${resolvedPath} (${mimeType})`);

			const buffer = await readFile(resolvedPath);
			const base64 = buffer.toString('base64');

			if (mimeType.startsWith('image/')) {
				this._mediaContentParts.push({
					type: 'image_url',
					image_url: { url: `data:${mimeType};base64,${base64}` }
				});
			} else if (mimeType === 'application/pdf') {
				log.warn(`PDF files are not natively supported as content blocks by OpenAI. Skipping: ${basename(resolvedPath)}`);
				continue;
			}

			log.debug(`Media file encoded: ${basename(resolvedPath)}`);
		}

		// 3. Build unified context and seed into history
		/** @type {Array<string>} */
		const textParts = [];

		// Local file contents
		for (const lf of this._localFileContents) {
			textParts.push(`--- File: ${lf.name} ---\n${lf.content}`);
		}

		// Local data entries
		for (const ld of this.localData) {
			const serialized = typeof ld.data === 'string' ? ld.data : JSON.stringify(ld.data, null, 2);
			textParts.push(`--- Data: ${ld.name} ---\n${serialized}`);
		}

		const hasMedia = this._mediaContentParts.length > 0;
		const hasText = textParts.length > 0;

		if (hasMedia || hasText) {
			const contextLabel = 'Here are the documents and data to analyze.';

			if (hasMedia) {
				// With images: use array of content parts
				/** @type {Array<Object>} */
				const contentParts = [...this._mediaContentParts];
				const fullText = hasText
					? textParts.join('\n\n') + '\n\n' + contextLabel
					: contextLabel;
				contentParts.push({ type: 'text', text: fullText });

				this.history = [
					{ role: 'user', content: contentParts },
					{ role: 'assistant', content: 'I have reviewed all the provided documents and data. I am ready to answer your questions about them.' }
				];
			} else {
				// Text-only: use plain string content
				const fullText = textParts.join('\n\n') + '\n\n' + contextLabel;

				this.history = [
					{ role: 'user', content: fullText },
					{ role: 'assistant', content: 'I have reviewed all the provided documents and data. I am ready to answer your questions about them.' }
				];
			}
		}

		this._initialized = true;
		log.debug(`RagAgent initialized with ${this._localFileContents.length} local files, ${this.localData.length} data entries, ${this._mediaContentParts.length} media files`);
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

		let fullText = '';
		const streamIterable = await this._streamMessage(message, opts);

		for await (const chunk of streamIterable) {
			const delta = chunk.choices?.[0]?.delta;
			if (delta?.content) {
				fullText += delta.content;
				yield { type: 'text', text: delta.content };
			}

			// Capture usage from the final chunk (OpenAI sends it on the last chunk)
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

		// Push assistant response to history
		this.history.push({ role: 'assistant', content: fullText });

		yield {
			type: 'done',
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
			localFiles: this._localFileContents.map(lf => ({
				name: lf.name,
				path: lf.path,
				size: lf.content.length
			})),
			localData: this.localData.map(ld => ({
				name: ld.name,
				type: typeof ld.data === 'object' && ld.data !== null
					? (Array.isArray(ld.data) ? 'array' : 'object')
					: typeof ld.data
			})),
			mediaFiles: this.mediaFiles.map(f => ({
				path: resolve(f),
				name: basename(f),
				ext: extname(f).toLowerCase()
			}))
		};
	}
}

export default RagAgent;
