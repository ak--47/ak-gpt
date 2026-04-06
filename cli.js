#!/usr/bin/env node
/**
 * CLI for ak-gpt — streams a GPT response to stdout.
 * Usage: node ak-gpt/cli.js "your prompt here"
 *        MODEL=gpt-4.1 node ak-gpt/cli.js "prompt"
 */

import { Message } from './index.js';

// Silence SDK console.debug noise
console.debug = () => {};

const prompt = process.argv.slice(2).join(' ');

if (!prompt || prompt === '-h' || prompt === '--help') {
	console.log('Usage: node ak-gpt/cli.js "your prompt"');
	console.log('  MODEL env var overrides default model (gpt-4o)');
	console.log('  Web search is enabled by default');
	process.exit(prompt ? 0 : 1);
}

try {
	const msg = new Message({
		modelName: process.env.MODEL || 'gpt-4o',
		enableWebSearch: true,
		systemPrompt: 'Respond in plain text only. Do not use markdown formatting (no bold, italic, headers, bullet points, code fences, etc.).',
		logLevel: 'none'
	});
	await msg.init();

	const stream = await msg.client.chat.completions.create({
		model: msg.modelName,
		max_tokens: msg.maxTokens,
		messages: [
			...msg._buildSystemMessages(),
			{ role: 'user', content: prompt }
		],
		tools: msg._buildTools(),
		stream: true
	});

	for await (const chunk of stream) {
		const delta = chunk.choices?.[0]?.delta?.content;
		if (delta) process.stdout.write(delta);
	}
	process.stdout.write('\n');
} catch (err) {
	console.error(`❌ ${err.message}`);
	process.exit(1);
}
