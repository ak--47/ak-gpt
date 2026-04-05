/**
 * Jest setup file for all ak-gpt tests.
 *
 * Uses OPENAI_API_KEY from .env for authentication.
 * Test model: gpt-5-nano (cheapest, fastest).
 */

import dotenv from 'dotenv';
dotenv.config({ quiet: true });

const TEST_MODEL = 'gpt-5-nano';

const { OPENAI_API_KEY } = process.env;
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required for tests");

const BASE_OPTIONS = {
	modelName: TEST_MODEL,
	apiKey: OPENAI_API_KEY,
	logLevel: 'warn'
};

export { BASE_OPTIONS, TEST_MODEL };

// Set test timeout globally
if (typeof jest !== 'undefined') {
	jest.setTimeout(30000);
}

// Global test helpers
global.delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
