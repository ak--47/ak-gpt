import { ToolAgent } from '../index.js';
import { BASE_OPTIONS } from './setup.js';

const HTTP_TOOLS = [
	{
		name: 'http_get',
		description: 'Make an HTTP GET request to any URL. Returns the response status and body.',
		parameters: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'The full URL to request' }
			},
			required: ['url']
		}
	},
	{
		name: 'http_post',
		description: 'Make an HTTP POST request with a JSON body.',
		parameters: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'The full URL to request' },
				body: { type: 'object', description: 'The JSON body to send' }
			},
			required: ['url']
		}
	}
];

const MAX_BODY = 50_000;

async function httpToolExecutor(name, args) {
	switch (name) {
		case 'http_get': {
			const resp = await fetch(args.url, { method: 'GET', signal: AbortSignal.timeout(30000) });
			const text = await resp.text();
			const body = text.length > MAX_BODY ? text.slice(0, MAX_BODY) + '\n...[TRUNCATED]' : text;
			let parsed;
			try { parsed = JSON.parse(body); } catch { parsed = body; }
			return { status: resp.status, statusText: resp.statusText, body: parsed };
		}
		case 'http_post': {
			const resp = await fetch(args.url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: args.body ? JSON.stringify(args.body) : undefined,
				signal: AbortSignal.timeout(30000)
			});
			const text = await resp.text();
			const body = text.length > MAX_BODY ? text.slice(0, MAX_BODY) + '\n...[TRUNCATED]' : text;
			let parsed;
			try { parsed = JSON.parse(body); } catch { parsed = body; }
			return { status: resp.status, statusText: resp.statusText, body: parsed };
		}
		default:
			throw new Error(`Unknown tool: ${name}`);
	}
}

function makeAgentWithTools(extraOpts = {}) {
	return new ToolAgent({ ...BASE_OPTIONS, tools: HTTP_TOOLS, toolExecutor: httpToolExecutor, ...extraOpts });
}

describe('ToolAgent', () => {

	describe('Constructor', () => {
		it('should create with tools and executor', () => {
			const agent = makeAgentWithTools();
			expect(agent.tools.length).toBe(2);
			expect(agent.toolExecutor).toBe(httpToolExecutor);
			expect(agent.maxToolRounds).toBe(10);
		});
		it('should throw if tools provided without executor', () => {
			expect(() => new ToolAgent({ ...BASE_OPTIONS, tools: HTTP_TOOLS })).toThrow(/toolExecutor/i);
		});
		it('should throw if executor provided without tools', () => {
			expect(() => new ToolAgent({ ...BASE_OPTIONS, toolExecutor: httpToolExecutor })).toThrow(/tool/i);
		});
		it('should accept custom systemPrompt', () => {
			expect(makeAgentWithTools({ systemPrompt: 'You are a pirate.' }).systemPrompt).toBe('You are a pirate.');
		});
		it('should accept custom maxToolRounds', () => {
			expect(makeAgentWithTools({ maxToolRounds: 5 }).maxToolRounds).toBe(5);
		});
		it('should normalize tool format from Claude/Gemini input_schema to OpenAI format', () => {
			const agent = new ToolAgent({
				...BASE_OPTIONS,
				tools: [{ name: 'test', description: 'test tool', input_schema: { type: 'object', properties: {} } }],
				toolExecutor: async () => ({})
			});
			// Should be wrapped in OpenAI { type: 'function', function: { ... } } format
			expect(agent.tools[0].type).toBe('function');
			expect(agent.tools[0].function.name).toBe('test');
			expect(agent.tools[0].function.parameters).toEqual({ type: 'object', properties: {} });
		});
	});

	describe('parallelToolCalls', () => {
		it('should default to true', () => {
			const agent = makeAgentWithTools();
			expect(agent.parallelToolCalls).toBe(true);
			expect(agent._concurrency).toBe(Infinity);
		});
		it('should accept false for sequential execution', () => {
			const agent = makeAgentWithTools({ parallelToolCalls: false });
			expect(agent.parallelToolCalls).toBe(false);
			expect(agent._concurrency).toBe(1);
		});
		it('should accept a number for concurrency limit', () => {
			const agent = makeAgentWithTools({ parallelToolCalls: 3 });
			expect(agent.parallelToolCalls).toBe(3);
			expect(agent._concurrency).toBe(3);
		});
	});

	describe('chat() — non-streaming', () => {
		it('should handle a simple text conversation', async () => {
			const agent = makeAgentWithTools({
				systemPrompt: 'You are a helpful assistant. Respond concisely. When asked simple questions, answer directly without using tools.'
			});
			const response = await agent.chat('What is 2 + 2? Reply with just the number.');
			expect(response.text).toBeTruthy();
			expect(response.text).toContain('4');
			expect(response.toolCalls).toEqual([]);
		});
		it('should return AgentResponse structure', async () => {
			const agent = makeAgentWithTools({ systemPrompt: 'Respond concisely.' });
			const response = await agent.chat('Say hello.');
			expect(response).toHaveProperty('text');
			expect(response).toHaveProperty('toolCalls');
			expect(response).toHaveProperty('usage');
			expect(Array.isArray(response.toolCalls)).toBe(true);
		});
		it('should trigger http_get when asked to fetch', async () => {
			const agent = makeAgentWithTools({
				systemPrompt: 'You are a helpful assistant. When asked to fetch a URL, always use the http_get tool.'
			});
			const response = await agent.chat('Please fetch this URL: https://jsonplaceholder.typicode.com/todos/1');
			expect(response.toolCalls.length).toBeGreaterThan(0);
			expect(response.toolCalls[0].name).toBe('http_get');
			expect(response.toolCalls[0].args.url).toContain('jsonplaceholder');
			expect(response.toolCalls[0].result.status).toBe(200);
		});
	});

	describe('Callbacks', () => {
		it('should fire onToolCall callback', async () => {
			const calls = [];
			const agent = makeAgentWithTools({
				systemPrompt: 'Always use http_get when asked to fetch.',
				onToolCall: (name, args) => calls.push({ name, args })
			});
			await agent.chat('Fetch https://jsonplaceholder.typicode.com/todos/1');
			expect(calls.length).toBeGreaterThan(0);
			expect(calls[0].name).toBe('http_get');
		});
		it('should not crash if onToolCall throws', async () => {
			const agent = makeAgentWithTools({
				systemPrompt: 'Always use http_get when asked to fetch.',
				onToolCall: () => { throw new Error('callback boom'); }
			});
			const response = await agent.chat('Fetch https://jsonplaceholder.typicode.com/todos/1');
			expect(response.toolCalls.length).toBeGreaterThan(0);
		});
	});

	describe('stream()', () => {
		it('should stream text with text and done events', async () => {
			const agent = makeAgentWithTools({ systemPrompt: 'Respond concisely.' });
			const events = [];
			for await (const event of agent.stream('What is 1 + 1? Reply with just the number.')) {
				events.push(event);
			}
			expect(events.filter(e => e.type === 'text').length).toBeGreaterThan(0);
			expect(events.filter(e => e.type === 'done').length).toBe(1);
			expect(events.find(e => e.type === 'done').fullText).toBeTruthy();
		});

		it('should yield tool_call and tool_result events', async () => {
			const agent = makeAgentWithTools({ systemPrompt: 'Always use http_get when asked to fetch.' });
			const events = [];
			for await (const event of agent.stream('Fetch https://jsonplaceholder.typicode.com/todos/1')) {
				events.push(event);
			}
			const toolCallEvents = events.filter(e => e.type === 'tool_call');
			const toolResultEvents = events.filter(e => e.type === 'tool_result');
			expect(toolCallEvents.length).toBeGreaterThan(0);
			expect(toolCallEvents[0].toolName).toBe('http_get');
			expect(toolResultEvents.length).toBeGreaterThan(0);
			expect(toolResultEvents[0].result.status).toBe(200);
		});
	});

	describe('onBeforeExecution', () => {
		it('should deny tool execution when callback returns false', async () => {
			const agent = makeAgentWithTools({
				systemPrompt: 'Always use http_get when asked to fetch.',
				onBeforeExecution: async () => false
			});
			const response = await agent.chat('Fetch https://jsonplaceholder.typicode.com/todos/1');
			expect(response.toolCalls.length).toBeGreaterThan(0);
			expect(response.toolCalls[0].result.error).toContain('denied');
		});
	});

	describe('stop()', () => {
		it('should have stop method', () => {
			expect(typeof makeAgentWithTools().stop).toBe('function');
		});
		it('should set _stopped flag', () => {
			const agent = makeAgentWithTools();
			expect(agent._stopped).toBe(false);
			agent.stop();
			expect(agent._stopped).toBe(true);
		});
	});

	describe('Conversation Management', () => {
		it('should return empty history before messages', () => {
			expect(makeAgentWithTools().getHistory()).toEqual([]);
		});
		it('should return non-empty history after messages', async () => {
			const agent = makeAgentWithTools();
			await agent.chat('Hello.');
			expect(agent.getHistory().length).toBeGreaterThan(0);
		});
		it('should clear history and reset state', async () => {
			const agent = makeAgentWithTools();
			await agent.chat('Test.');
			await agent.clearHistory();
			expect(agent.getHistory().length).toBe(0);
			expect(agent.lastResponseMetadata).toBeNull();
		});
	});
});
