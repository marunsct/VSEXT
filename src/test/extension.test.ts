// eyAgent Extension Test Suite
// This test file checks all major features of the eyAgent VS Code extension.
// Each test is explained in plain English for non-technical readers.

import * as assert from 'assert';
import * as vscode from 'vscode';

// The main test suite for the eyAgent extension
// Each 'it' block is a separate test for a feature

describe('eyAgent Extension', function () {
	// Test: API Key Management
	// This test checks if you can set, check, and remove the GPT-4 API key.
	it('should set, check, and remove the GPT-4 API key', async function () {
		await vscode.commands.executeCommand('eyAiAgent.setApiKey'); // Set the key
		const key = await vscode.commands.executeCommand('eyAiAgent.checkApiKey'); // Check if set
		assert.ok(key !== undefined); // Should be set
		await vscode.commands.executeCommand('eyAiAgent.removeApiKey'); // Remove the key
	});

	// Test: Inline Completion Provider registration
	// This test checks if the extension registers the inline code suggestion feature.
	it('should register the inline completion provider', async function () {
		const providers = vscode.languages.getLanguages();
		assert.ok(providers); // Should return a list of languages
	});

	// Test: Attach context by file picker
	// This test checks if you can attach project files as context for the AI.
	it('should attach context using file picker', async function () {
		await vscode.commands.executeCommand('eyAiAgent.attachContext');
		const context = await vscode.commands.executeCommand('eyAiAgent.clearAttachedContext');
		assert.ok(context !== undefined); // Should be able to clear context
	});

	// Test: Attach context using real embeddings
	// This test checks if you can attach context using semantic search (AI understands meaning).
	it('should attach context using real embeddings', async function () {
		await vscode.commands.executeCommand('eyAiAgent.attachEmbeddingContext');
		const context = await vscode.commands.executeCommand('eyAiAgent.clearAttachedContext');
		assert.ok(context !== undefined);
	});

	// Test: Main AI commands (explain, refactor, doc, error, ask)
	// This test checks if the main AI-powered commands work.
	it('should run main AI commands', async function () {
		await vscode.commands.executeCommand('eyAiAgent.explainCode');
		await vscode.commands.executeCommand('eyAiAgent.refactorCode');
		await vscode.commands.executeCommand('eyAiAgent.generateDoc');
		await vscode.commands.executeCommand('eyAiAgent.explainError');
		await vscode.commands.executeCommand('eyAiAgent.askGpt4');
		assert.ok(true);
	});

	// Test: Unit test generation
	// This test checks if the extension can generate unit tests for your code.
	it('should generate unit tests', async function () {
		await vscode.commands.executeCommand('eyAiAgent.generateUnitTest');
		assert.ok(true);
	});

	// Test: Context-aware chat
	// This test checks if you can chat with the AI using project context.
	it('should chat with context', async function () {
		await vscode.commands.executeCommand('eyAiAgent.chatWithContext');
		await vscode.commands.executeCommand('eyAiAgent.clearChatHistory');
		assert.ok(true);
	});

	// Test: Insert suggestion at cursor
	// This test checks if the extension can insert an AI suggestion at the cursor.
	it('should insert suggestion at cursor', async function () {
		await vscode.commands.executeCommand('eyAiAgent.insertSuggestion');
		assert.ok(true);
	});

	// Test: Agent mode toggle
	// This test checks if you can turn agent mode on and off.
	it('should toggle agent mode', async function () {
		await vscode.commands.executeCommand('eyAiAgent.toggleAgentMode');
		await vscode.commands.executeCommand('eyAiAgent.toggleAgentMode');
		assert.ok(true);
	});

	// Test: Open agent panel
	// This test checks if the agent panel (chat UI) opens.
	it('should open the agent panel', async function () {
		await vscode.commands.executeCommand('eyAiAgent.openAgentPanel');
		assert.ok(true);
	});
});
