import { Chat, Transformer, BaseGPT, log } from '../index.js';
import { BASE_OPTIONS } from './setup.js';

describe('BaseGPT — Shared Behavior', () => {

	describe('Authentication', () => {
		it('should throw on missing API key', () => {
			const originalKey = process.env.OPENAI_API_KEY;
			delete process.env.OPENAI_API_KEY;
			try {
				expect(() => new Chat({ modelName: 'gpt-5-nano', logLevel: 'warn' })).toThrow(/api key/i);
			} finally {
				process.env.OPENAI_API_KEY = originalKey;
			}
		});
		it('should throw on empty string API key', () => {
			const originalKey = process.env.OPENAI_API_KEY;
			delete process.env.OPENAI_API_KEY;
			try {
				expect(() => new Chat({ apiKey: '', logLevel: 'warn' })).toThrow(/api key/i);
			} finally {
				process.env.OPENAI_API_KEY = originalKey;
			}
		});
		it('should accept API key via options', () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			expect(chat.apiKey).toBeTruthy();
		});
	});

	describe('init()', () => {
		it('should initialize the client', async () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			await chat.init();
			expect(chat._initialized).toBe(true);
			expect(chat.client).toBeTruthy();
		});
		it('should be idempotent', async () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			await chat.init();
			const client = chat.client;
			await chat.init();
			expect(chat.client).toBe(client);
		});
		it('should reinitialize when force=true', async () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			await chat.init();
			await chat.init(true);
			expect(chat._initialized).toBe(true);
		});
	});

	describe('getLastUsage()', () => {
		it('should return null before any API call', () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			expect(chat.getLastUsage()).toBeNull();
		});
		it('should return usage data after a call', async () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			await chat.send('Say hi.');
			const usage = chat.getLastUsage();
			expect(usage).toBeTruthy();
			expect(typeof usage.promptTokens).toBe('number');
			expect(typeof usage.responseTokens).toBe('number');
			expect(typeof usage.totalTokens).toBe('number');
			expect(usage.promptTokens).toBeGreaterThan(0);
			expect(usage.requestedModel).toBe(BASE_OPTIONS.modelName);
			expect(typeof usage.timestamp).toBe('number');
		});
	});

	describe('estimate()', () => {
		it('should estimate input tokens for a payload', async () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			await chat.init();
			const count = await chat.estimate({ foo: "bar" });
			expect(typeof count.inputTokens).toBe('number');
			expect(count.inputTokens).toBeGreaterThan(0);
		});
	});

	describe('estimateCost()', () => {
		it('should estimate cost based on input tokens', async () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			await chat.init();
			const cost = await chat.estimateCost({ test: 'payload' });
			expect(cost).toHaveProperty('inputTokens');
			expect(cost).toHaveProperty('model');
			expect(cost).toHaveProperty('pricing');
			expect(cost).toHaveProperty('estimatedInputCost');
			expect(cost.model).toBe(BASE_OPTIONS.modelName);
		});
	});

	describe('seed()', () => {
		it('should add example pairs to chat history', async () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			await chat.init();
			await chat.seed([
				{ PROMPT: { x: 1 }, ANSWER: { y: 2 } },
				{ PROMPT: { x: 3 }, ANSWER: { y: 6 } }
			]);
			const history = chat.getHistory();
			expect(history.length).toBe(4);
		});
		it('should handle empty or null examples', async () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			await chat.init();
			await chat.seed([]);
			await chat.seed(null);
			await chat.seed(undefined);
		});
	});

	describe('getHistory()', () => {
		it('should return empty array before init', () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			expect(chat.getHistory()).toEqual([]);
		});
	});

	describe('clearHistory()', () => {
		it('should clear history', async () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			await chat.send('Remember this.');
			expect(chat.getHistory().length).toBeGreaterThan(0);
			await chat.clearHistory();
			expect(chat.getHistory().length).toBe(0);
			expect(chat.lastResponseMetadata).toBeNull();
		});
		it('should not throw when called before init', async () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			await chat.clearHistory();
		});
	});

	describe('maxTokens', () => {
		it('should use default when not specified', () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			expect(chat.maxTokens).toBe(8192);
		});
		it('should accept custom maxTokens', () => {
			const chat = new Chat({ ...BASE_OPTIONS, maxTokens: 4096 });
			expect(chat.maxTokens).toBe(4096);
		});
	});

	describe('Log Level', () => {
		it('should accept logLevel "none" as silent', () => {
			new Chat({ ...BASE_OPTIONS, logLevel: 'none' });
			expect(log.level).toBe('silent');
		});
		it('should accept custom logLevel', () => {
			new Chat({ ...BASE_OPTIONS, logLevel: 'error' });
			expect(log.level).toBe('error');
		});
	});

	describe('Web Search', () => {
		it('should default enableWebSearch to false', () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			expect(chat.enableWebSearch).toBe(false);
		});
		it('should accept enableWebSearch option', () => {
			const chat = new Chat({ ...BASE_OPTIONS, enableWebSearch: true });
			expect(chat.enableWebSearch).toBe(true);
		});
		it('should include web search tool when enabled via _buildTools', () => {
			const chat = new Chat({ ...BASE_OPTIONS, enableWebSearch: true });
			const tools = chat._buildTools();
			expect(tools).toBeDefined();
			expect(tools[0].type).toBe('web_search_preview');
		});
		it('should not include web search when disabled', () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			expect(chat._buildTools()).toBeUndefined();
		});
	});

	describe('Constructor', () => {
		it('should set model name', () => {
			expect(new Chat({ ...BASE_OPTIONS }).modelName).toBe(BASE_OPTIONS.modelName);
		});
		it('should have null lastResponseMetadata before any call', () => {
			expect(new Chat({ ...BASE_OPTIONS }).lastResponseMetadata).toBeNull();
		});
	});

	describe('Clients Namespace', () => {
		it('should expose openai and raw clients', () => {
			const chat = new Chat({ ...BASE_OPTIONS });
			expect(chat.clients.openai).toBeTruthy();
			expect(chat.clients.raw).toBeTruthy();
			expect(chat.clients.openai).toBe(chat.client);
			expect(chat.clients.raw).toBe(chat.client);
		});
	});
});
