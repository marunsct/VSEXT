// This file boots up the Mocha test environment for VS Code extension tests.
// It is required for the 'describe' and 'it' functions to work in your test files.
//
// This is required for Mocha to work in VS Code extension tests.
// It tells VS Code to use Mocha's BDD (describe/it) test runner.
// See https://code.visualstudio.com/api/working-with-extensions/testing-extension for details.
//
// If you use @vscode/test-cli, make sure your package.json test command is:
// "test": "@vscode/test-cli --extensionDevelopmentPath=. --extensionTestsPath=./out/test/index.js"

import * as path from 'path';
// Fix for Mocha and glob import usage in ESM/TypeScript
import Mocha = require('mocha');
// import { glob } from 'glob';
import { globSync } from 'glob';

export function run(): Promise<void> {
	const mocha = new Mocha({
		ui: 'bdd',
		color: true
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((resolve, reject) => {
		// glob('**/*.test.js', { cwd: testsRoot }, (err: any, files: string[]) => {
		// 			if (err) {
		// 				reject(err);
		// 				return;
		// 			}
		try {
			const files = globSync('**/*.test.js', { cwd: testsRoot });
			// Add files to the test suite
			files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

			// Run the mocha test
			mocha.run(failures => {
				if (failures > 0) {
					reject(new Error(`${failures} tests failed.`));
				} else {
					resolve();
				}
			});
		} catch (err) {
			reject(err);
		}
	});
}
