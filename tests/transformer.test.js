import { Transformer } from '../index.js';
import { BASE_OPTIONS as _BASE_OPTIONS } from './setup.js';
import path from 'path';
import fs from 'fs';

const BASE_OPTIONS = { ..._BASE_OPTIONS, temperature: 0.1 };

describe('Transformer — Basics', () => {
	let transformer;
	const simpleExamples = [
		{ PROMPT: { x: 1 }, ANSWER: { y: 2 } },
		{ PROMPT: { x: 3 }, ANSWER: { y: 6 } }
	];

	beforeAll(async () => {
		transformer = new Transformer({ ...BASE_OPTIONS });
		await transformer.init();
	});
	beforeEach(async () => { await transformer.reset(); });

	describe('Constructor', () => {
		it('should create with default options', () => {
			const t = new Transformer({ ...BASE_OPTIONS });
			expect(t.modelName).toMatch(/gpt/);
			expect(typeof t.init).toBe('function');
			expect(typeof t.send).toBe('function');
			expect(typeof t.seed).toBe('function');
		});
		it('should have onlyJSON true by default', () => {
			expect(new Transformer({ ...BASE_OPTIONS }).onlyJSON).toBe(true);
		});
		it('should throw when promptKey === answerKey', () => {
			expect(() => new Transformer({ ...BASE_OPTIONS, promptKey: 'X', answerKey: 'X' }))
				.toThrow(/same/i);
		});
	});

	describe('seed', () => {
		it('should seed chat with examples', async () => {
			await transformer.seed(simpleExamples);
			const history = transformer.getHistory();
			expect(Array.isArray(history)).toBe(true);
			expect(history.length).toBeGreaterThan(0);
		});
	});

	describe('send', () => {
		it('should transform a basic payload', async () => {
			await transformer.seed(simpleExamples);
			const result = await transformer.send({ x: 10 });
			expect(result).toBeTruthy();
			expect(typeof result).toBe('object');
		});
	});

	describe('rawSend', () => {
		it('should send directly and return parsed JSON', async () => {
			await transformer.seed(simpleExamples);
			const result = await transformer.rawSend({ x: 5 });
			expect(result).toBeTruthy();
			expect(typeof result).toBe('object');
		});
	});
});


describe('Transformer — Validation & Retry', () => {
	let transformer;
	beforeEach(async () => {
		transformer = new Transformer({ ..._BASE_OPTIONS, temperature: 0.1 });
		await transformer.init();
	});

	it('should retry on validation failure', async () => {
		await transformer.seed([{ PROMPT: { value: 1 }, ANSWER: { result: 2 } }]);
		let attempts = 0;
		const validator = (payload) => {
			attempts++;
			if (attempts < 2) throw new Error("Validation failed - retry needed");
			return Promise.resolve(payload);
		};
		const result = await transformer.send({ value: 5 }, { maxRetries: 2 }, validator);
		expect(result).toBeTruthy();
		expect(attempts).toBe(2);
	});

	it('should throw after max retries exhausted', async () => {
		const validator = () => { throw new Error("Always fails"); };
		await expect(
			transformer.send({ test: 1 }, { maxRetries: 1 }, validator)
		).rejects.toThrow(/failed after 2 attempts/i);
	});
});


describe('Transformer — State & Reset', () => {
	it('should clear history on reset()', async () => {
		const transformer = new Transformer({ ..._BASE_OPTIONS, temperature: 0.1 });
		await transformer.seed([{ PROMPT: { x: 1 }, ANSWER: { y: 2 } }]);
		expect(transformer.getHistory().length).toBe(2);
		await transformer.reset();
		expect(transformer.getHistory().length).toBe(0);
	});

	it('should preserve examples on clearHistory()', async () => {
		const transformer = new Transformer({ ..._BASE_OPTIONS, temperature: 0.1 });
		await transformer.seed([{ PROMPT: { x: 1 }, ANSWER: { y: 2 } }]);
		const initialCount = transformer.exampleCount;
		await transformer.send({ x: 5 });
		await transformer.clearHistory();
		expect(transformer.getHistory().length).toBe(initialCount);
	});
});


describe('Transformer — updateSystemPrompt', () => {
	it('should update system prompt', async () => {
		const transformer = new Transformer({ ..._BASE_OPTIONS, temperature: 0.1 });
		await transformer.init();
		const original = transformer.systemPrompt;
		await transformer.updateSystemPrompt('You are a math tutor.');
		expect(transformer.systemPrompt).toBe('You are a math tutor.');
		expect(transformer.systemPrompt).not.toBe(original);
	});
	it('should throw on empty/null prompt', async () => {
		const transformer = new Transformer({ ..._BASE_OPTIONS, temperature: 0.1 });
		await transformer.init();
		await expect(transformer.updateSystemPrompt('')).rejects.toThrow(/non-empty string/);
		await expect(transformer.updateSystemPrompt(null)).rejects.toThrow(/non-empty string/);
	});
});


describe('Transformer — System Prompt Handling', () => {
	it('should use default JSON instructions when systemPrompt not provided', () => {
		const t = new Transformer({ ..._BASE_OPTIONS });
		expect(t.systemPrompt).toContain('JSON transformation engine');
	});
	it('should use custom systemPrompt', () => {
		const t = new Transformer({ ..._BASE_OPTIONS, systemPrompt: 'You are a pirate.' });
		expect(t.systemPrompt).toBe('You are a pirate.');
	});
	it('should set systemPrompt to null when set to null', () => {
		const t = new Transformer({ ..._BASE_OPTIONS, systemPrompt: null });
		expect(t.systemPrompt).toBeNull();
	});
});


describe('Transformer — Stateless Send', () => {
	it('should send stateless without affecting history', async () => {
		const transformer = new Transformer({ ..._BASE_OPTIONS, temperature: 0.1 });
		await transformer.init();
		await transformer.seed([{ PROMPT: { x: 1 }, ANSWER: { y: 2 } }]);
		const historyBefore = transformer.getHistory().length;
		const result = await transformer.send({ x: 5 }, { stateless: true });
		expect(result).toBeTruthy();
		expect(typeof result).toBe('object');
		expect(transformer.getHistory().length).toBe(historyBefore);
	});
});


describe('Transformer — Seeding Edge Cases', () => {
	let transformer;
	beforeEach(async () => {
		transformer = new Transformer({ ..._BASE_OPTIONS, temperature: 0.1 });
		await transformer.init();
	});

	it('should handle empty examples array', async () => {
		await transformer.seed([]);
		expect(transformer.getHistory().length).toBe(0);
	});
	it('should handle null/undefined examples', async () => {
		await transformer.seed(null);
		await transformer.seed(undefined);
	});
});


describe('Transformer — exampleData option', () => {
	it('should use exampleData from constructor when seed called with no args', async () => {
		const transformer = new Transformer({
			..._BASE_OPTIONS,
			temperature: 0.1,
			exampleData: [{ PROMPT: { a: 1 }, ANSWER: { b: 2 } }]
		});
		await transformer.init();
		await transformer.seed();
		expect(transformer.getHistory().length).toBe(2);
	});
	it('should throw on invalid exampleData type', async () => {
		const transformer = new Transformer({ ..._BASE_OPTIONS, temperature: 0.1, exampleData: 'not-an-array' });
		await transformer.init();
		await expect(transformer.seed()).rejects.toThrow(/invalid example data/i);
	});
});


describe('Transformer — File-based Examples', () => {
	const examplesFilePath = path.resolve('./tests/examples.json');
	const examplesContent = [
		{ "userInput": "What is the weather?", "assistantResponse": { "answer": "sunny" } },
		{ "userInput": "Tell a joke", "assistantResponse": { "joke": "Why did the chicken cross the road?" } }
	];

	beforeAll(() => {
		fs.writeFileSync(examplesFilePath, JSON.stringify(examplesContent, null, 4));
	});
	afterAll(() => { fs.unlinkSync(examplesFilePath); });

	it('should load examples from file', async () => {
		const transformer = new Transformer({
			..._BASE_OPTIONS,
			temperature: 0.1,
			examplesFile: examplesFilePath,
			promptKey: 'userInput',
			answerKey: 'assistantResponse'
		});
		await transformer.seed();
		expect(transformer.getHistory().length).toBe(4);
	});
	it('should handle missing examples file', async () => {
		const transformer = new Transformer({ ..._BASE_OPTIONS, temperature: 0.1, examplesFile: './nonexistent.json' });
		await transformer.init();
		try { await transformer.seed(); } catch (error) {
			expect(error.message).toMatch(/could not load/i);
		}
	});
});
