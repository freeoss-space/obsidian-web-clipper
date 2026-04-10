import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
	},
	resolve: {
		alias: {
			// Point the type-only 'obsidian' package to a lightweight stub so that
			// any test that imports source files depending on the Obsidian API can run.
			obsidian: path.resolve(__dirname, 'src/__mocks__/obsidian.ts'),
		},
	},
});
