// === eyAgent VS Code Extension - Modularized and Explained ===

// --- 1. Imports and Constants ---
// Importing required modules for VS Code extension development and file operations.
import * as vscode from 'vscode'; // VS Code API
import * as fs from 'fs';         // File system operations
import * as path from 'path';     // Path utilities
import fetch from 'node-fetch';   // HTTP requests

// Key for storing the GPT-4 API key securely in VS Code's secret storage.
const GPT4_API_KEY_SECRET = 'gpt4ApiKey';
// Log file name for local logging.
const LOG_FILE = 'eyAgent.log';

// --- 2. Logging Utility ---
// This function logs messages to a local file for troubleshooting and auditing.
function logToFile(context: vscode.ExtensionContext, message: string) {
	const logPath = path.join(context.globalStorageUri.fsPath, LOG_FILE);
	fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true }); // Ensure directory exists
	fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`); // Append log
}

// --- 3. OpenAI API Helper ---
// This function sends a prompt to OpenAI's GPT-4 API and returns the response.
async function callGpt4Api(apiKey: string, prompt: string): Promise<string> {
	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: 'gpt-4',
			messages: [ { role: 'user', content: prompt } ],
			max_tokens: 128,
			temperature: 0.7
		})
	});
	if (!response.ok) {
		throw new Error(`OpenAI API error: ${response.statusText}`);
	}
	const data = await response.json();
	return data.choices?.[0]?.message?.content?.trim() || '';
}

// --- 4. Inline Completion Provider ---
// This class provides inline code suggestions (ghost text) as you type in VS Code.
class GPT4InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
	constructor(private context: vscode.ExtensionContext) {}

	async provideInlineCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.InlineCompletionContext,
		token: vscode.CancellationToken
	): Promise<vscode.InlineCompletionList> {
		const apiKey = await this.context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			return new vscode.InlineCompletionList([]);
		}
		const prompt = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
		let suggestion = '';
		try {
			suggestion = await callGpt4Api(apiKey, prompt + '\n// Complete the next line of code:');
			logToFile(this.context, `Inline suggestion requested at ${position.line}:${position.character}`);
		} catch (e: any) {
			logToFile(this.context, `Inline suggestion error: ${e.message}`);
		}
		return new vscode.InlineCompletionList([
			new vscode.InlineCompletionItem(suggestion || '// No suggestion', new vscode.Range(position, position))
		]);
	}
}

// --- 5. Context Building and Indexing ---
// Context building means collecting relevant code/text from your project to help the AI understand your codebase.
// Indexing is the process of scanning files and storing their content for fast lookup and semantic search.

// In-memory cache for file contents (context).
let contextCache: { [key: string]: string } = {};

// This function scans the workspace for code/text files and stores their content in contextCache.
async function indexWorkspace() {
	if (!vscode.workspace.workspaceFolders) {
		return;
	}
	const files = await vscode.workspace.findFiles('**/*.{ts,js,py,java,cpp,cs,go,rb,php,rs,md,txt}', '**/node_modules/**', 100);
	for (const file of files) {
		try {
			const doc = await vscode.workspace.openTextDocument(file);
			contextCache[file.fsPath] = doc.getText();
		} catch {}
	}
}

// --- 6. Embedding and Semantic Search ---
// Embeddings are numerical representations of text that allow the AI to compare meaning (semantics) between texts.
// This enables finding the most relevant files for a given query, even if the words are different.

// Get an embedding vector for a text using OpenAI's API.
async function getEmbedding(text: string, apiKey: string): Promise<number[] | undefined> {
	try {
		const response = await fetch('https://api.openai.com/v1/embeddings', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`
			},
			body: JSON.stringify({ model: 'text-embedding-ada-002', input: text })
		});
		if (!response.ok) { return undefined; }
		const data = await response.json();
		return data.data?.[0]?.embedding;
	} catch { return undefined; }
}

// Build an index of embeddings for all files in the context cache.
let embeddingIndex: { file: string, embedding: number[] }[] = [];
async function buildEmbeddingIndex(apiKey: string) {
	await indexWorkspace();
	embeddingIndex = [];
	for (const [file, text] of Object.entries(contextCache)) {
		const emb = await getEmbedding(text.slice(0, 2000), apiKey); // Limit size for API
		if (emb) { embeddingIndex.push({ file, embedding: emb }); }
	}
}

// Calculate cosine similarity between two embedding vectors (higher = more similar).
function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0, normA = 0, normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// --- 7. Context Trimming ---
// To avoid sending too much data to the AI (which can cause errors or high costs),
// we trim the context to a safe token limit (approx. 2000 tokens).
function trimContextToTokenLimit(contextText: string, maxTokens: number = 2000): string {
	const maxLen = maxTokens * 4; // 1 token ~ 4 chars
	if (contextText.length > maxLen) {
		return contextText.slice(0, maxLen) + '\n... [context trimmed]';
	}
	return contextText;
}

// --- 8. Main Extension Activation ---
// This function is called when the extension is activated in VS Code.
export function activate(context: vscode.ExtensionContext) {
	// Register all commands and features here.

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "eyAiAgent" is now active!');

	// Register command to set API key securely
	const setApiKeyDisposable = vscode.commands.registerCommand('eyAiAgent.setApiKey', async () => {
		const apiKey = await vscode.window.showInputBox({
			prompt: 'Enter your GPT-4 API Key',
			ignoreFocusOut: true,
			password: true,
		});
		if (apiKey) {
			await context.secrets.store(GPT4_API_KEY_SECRET, apiKey);
			vscode.window.showInformationMessage('GPT-4 API Key saved securely.');
		}
	});

	// Register command to remove API key
	const removeApiKeyDisposable = vscode.commands.registerCommand('eyAiAgent.removeApiKey', async () => {
		await context.secrets.delete(GPT4_API_KEY_SECRET);
		vscode.window.showInformationMessage('GPT-4 API Key removed.');
	});

	// Register command to show if API key is set
	const checkApiKeyDisposable = vscode.commands.registerCommand('eyAiAgent.checkApiKey', async () => {
		const key = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (key) {
			vscode.window.showInformationMessage('GPT-4 API Key is set.');
		} else {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
		}
	});

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('eyAiAgent.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from eyAgent!');
	});

	// Register inline completion provider (ghost text)
	context.subscriptions.push(
		vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, new GPT4InlineCompletionProvider(context))
	);

	// Register chat/ask command
	const chatDisposable = vscode.commands.registerCommand('eyAiAgent.askGpt4', async () => {
		const question = await vscode.window.showInputBox({ prompt: 'Ask GPT-4 (eyAgent):', ignoreFocusOut: true });
		if (!question) {
			return;
		}
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		let answer = '';
		try {
			answer = await callGpt4Api(apiKey, question);
			logToFile(context, `Chat/Ask: ${question}`);
		} catch (e: any) {
			answer = 'Error: ' + e.message;
			logToFile(context, `Chat/Ask error: ${e.message}`);
		}
		const panel = vscode.window.createOutputChannel('eyAgent Chat');
		panel.appendLine('Q: ' + question);
		panel.appendLine('A: ' + answer);
		panel.show(true);
	});
	context.subscriptions.push(disposable, setApiKeyDisposable, removeApiKeyDisposable, checkApiKeyDisposable, chatDisposable);

	// Explain code command
	const explainDisposable = vscode.commands.registerCommand('eyAiAgent.explainCode', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor.');
			return;
		}
		const selection = editor.selection;
		const code = editor.document.getText(selection.isEmpty ? editor.document.getWordRangeAtPosition(selection.active) || selection : selection);
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		let answer = '';
		try {
			answer = await callGpt4Api(apiKey, `Explain the following code:\n${code}`);
			logToFile(context, `Explain code: ${code}`);
		} catch (e: any) {
			answer = 'Error: ' + e.message;
			logToFile(context, `Explain code error: ${e.message}`);
		}
		vscode.window.showInformationMessage(answer, { modal: true });
	});

	// Refactor code command
	const refactorDisposable = vscode.commands.registerCommand('eyAiAgent.refactorCode', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor.');
			return;
		}
		const selection = editor.selection;
		const code = editor.document.getText(selection.isEmpty ? editor.document.getWordRangeAtPosition(selection.active) || selection : selection);
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		let answer = '';
		try {
			answer = await callGpt4Api(apiKey, `Refactor the following code and explain the changes:\n${code}`);
			logToFile(context, `Refactor code: ${code}`);
		} catch (e: any) {
			answer = 'Error: ' + e.message;
			logToFile(context, `Refactor code error: ${e.message}`);
		}
		vscode.window.showInformationMessage(answer, { modal: true });
	});

	// Generate documentation command
	const docDisposable = vscode.commands.registerCommand('eyAiAgent.generateDoc', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor.');
			return;
		}
		const selection = editor.selection;
		const code = editor.document.getText(selection.isEmpty ? editor.document.getWordRangeAtPosition(selection.active) || selection : selection);
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		let answer = '';
		try {
			answer = await callGpt4Api(apiKey, `Write documentation comments for the following code:\n${code}`);
			logToFile(context, `Generate doc: ${code}`);
		} catch (e: any) {
			answer = 'Error: ' + e.message;
			logToFile(context, `Generate doc error: ${e.message}`);
		}
		vscode.window.showInformationMessage(answer, { modal: true });
	});

	// Explain error command
	const explainErrorDisposable = vscode.commands.registerCommand('eyAiAgent.explainError', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor.');
			return;
		}
		const selection = editor.selection;
		const errorText = editor.document.getText(selection.isEmpty ? editor.document.getWordRangeAtPosition(selection.active) || selection : selection);
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		let answer = '';
		try {
			answer = await callGpt4Api(apiKey, `Explain this error message and how to fix it:\n${errorText}`);
			logToFile(context, `Explain error: ${errorText}`);
		} catch (e: any) {
			answer = 'Error: ' + e.message;
			logToFile(context, `Explain error error: ${e.message}`);
		}
		vscode.window.showInformationMessage(answer, { modal: true });
	});

	// Multi-file/project context: gather open editors' content for context
	async function getWorkspaceContext(): Promise<string> {
		const editors = vscode.window.visibleTextEditors;
		let contextText = '';
		for (const editor of editors) {
			const doc = editor.document;
			if (doc && !doc.isUntitled && doc.getText().length < 10000) {
				contextText += `File: ${doc.fileName}\n${doc.getText()}\n\n`;
			}
		}
		return contextText;
	}

	// Command: Generate Unit Tests
	const testDisposable = vscode.commands.registerCommand('eyAiAgent.generateUnitTest', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor.');
			return;
		}
		const selection = editor.selection;
		const code = editor.document.getText(selection.isEmpty ? editor.document.getWordRangeAtPosition(selection.active) || selection : selection);
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		const workspaceContext = await getWorkspaceContext();
		let answer = '';
		try {
			answer = await callGpt4Api(apiKey, `Given the following project context:\n${workspaceContext}\nWrite unit tests for this code:\n${code}`);
			logToFile(context, `Generate unit test: ${code}`);
		} catch (e: any) {
			answer = 'Error: ' + e.message;
			logToFile(context, `Generate unit test error: ${e.message}`);
		}
		vscode.window.showInformationMessage(answer, { modal: true });
	});

	let chatHistory: { role: string, content: string }[] = [];
	const chatWithContextDisposable = vscode.commands.registerCommand('eyAiAgent.chatWithContext', async () => {
		const question = await vscode.window.showInputBox({ prompt: 'Chat with GPT-4 (context-aware):', ignoreFocusOut: true });
		if (!question) {
			return;
		}
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		const workspaceContext = await getWorkspaceContext();
		chatHistory.push({ role: 'user', content: question });
		let answer = '';
		try {
			const messages = [
				{ role: 'system', content: `You are an expert AI coding assistant. Here is the project context:\n${workspaceContext}` },
				...chatHistory
			];
			const response = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`
				},
				body: JSON.stringify({ model: 'gpt-4', messages, max_tokens: 256, temperature: 0.7 })
			});
			if (!response.ok) {
				throw new Error(`OpenAI API error: ${response.statusText}`);
			}
			const data = await response.json();
			answer = data.choices?.[0]?.message?.content?.trim() || '';
			chatHistory.push({ role: 'assistant', content: answer });
			logToFile(context, `Chat with context: ${question}`);
		} catch (e: any) {
			answer = 'Error: ' + e.message;
			logToFile(context, `Chat with context error: ${e.message}`);
		}
		const panel = vscode.window.createOutputChannel('eyAgent Chat');
		panel.appendLine('Q: ' + question);
		panel.appendLine('A: ' + answer);
		panel.show(true);
	});

	const clearChatDisposable = vscode.commands.registerCommand('eyAiAgent.clearChatHistory', () => {
		chatHistory = [];
		vscode.window.showInformationMessage('eyAgent chat history cleared.');
	});

	const insertSuggestionDisposable = vscode.commands.registerCommand('eyAiAgent.insertSuggestion', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor.');
			return;
		}
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		const prompt = editor.document.getText();
		let suggestion = '';
		try {
			suggestion = await callGpt4Api(apiKey, prompt + '\n// Suggest the next line of code:');
			logToFile(context, `Insert suggestion at cursor`);
		} catch (e: any) {
			vscode.window.showWarningMessage('Error: ' + e.message);
			logToFile(context, `Insert suggestion error: ${e.message}`);
			return;
		}
		editor.edit(editBuilder => {
			editBuilder.insert(editor.selection.active, suggestion);
		});
	});

	context.subscriptions.push(
		testDisposable,
		chatWithContextDisposable,
		clearChatDisposable,
		insertSuggestionDisposable
	);

	// Agent Mode: Enable/disable agent mode (auto-suggest, auto-respond, etc.)
	let agentModeEnabled = false;
	const toggleAgentModeDisposable = vscode.commands.registerCommand('eyAiAgent.toggleAgentMode', async () => {
		agentModeEnabled = !agentModeEnabled;
		vscode.window.showInformationMessage(`eyAgent Mode is now ${agentModeEnabled ? 'Enabled' : 'Disabled'}`);
		logToFile(context, `Agent mode toggled: ${agentModeEnabled}`);
	});

	const agentModeListener = vscode.workspace.onDidChangeTextDocument(async (event) => {
		if (!agentModeEnabled) {
			return;
		}
		const editor = vscode.window.activeTextEditor;
		if (!editor || event.document !== editor.document) {
			return;
		}
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			return;
		}
		const position = editor.selection.active;
		const prompt = editor.document.getText(new vscode.Range(new vscode.Position(0, 0), position));
		let suggestion = '';
		try {
			suggestion = await callGpt4Api(apiKey, prompt + '\n// Complete the next line of code:');
			logToFile(context, `Agent mode auto-suggest at ${position.line}:${position.character}`);
		} catch (e: any) {
			logToFile(context, `Agent mode error: ${e.message}`);
		}
		if (suggestion) {
			vscode.window.setStatusBarMessage(`eyAgent Suggestion: ${suggestion}`, 5000);
		}
	});

	context.subscriptions.push(toggleAgentModeDisposable, agentModeListener);

	context.subscriptions.push(vscode.commands.registerCommand('eyAiAgent.openAgentPanel', async () => {
		const panel = vscode.window.createWebviewPanel(
			'eyAgentPanel',
			'eyAgent (Copilot Mode)',
			vscode.ViewColumn.Beside,
			{ enableScripts: true }
		);
		panel.webview.html = getAgentPanelHtmlWithApply();
		panel.webview.onDidReceiveMessage(async (message) => {
			if (message.type === 'ask') {
				const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
				if (!apiKey) {
					panel.webview.postMessage({ type: 'answer', text: 'GPT-4 API Key is not set.' });
					return;
				}
				let answer = '';
				try {
					answer = await callGpt4Api(apiKey, message.text);
					logToFile(context, `Agent panel chat: ${message.text}`);
				} catch (e: any) {
					answer = 'Error: ' + e.message;
					logToFile(context, `Agent panel chat error: ${e.message}`);
				}
				panel.webview.postMessage({ type: 'answer', text: answer });
			}
		});
	}));

	// Store last chat suggestion for apply/insert
	let lastChatSuggestion: string | undefined = undefined;

	// Enhance chat panel: store last suggestion and add apply button
	context.subscriptions.push(vscode.commands.registerCommand('eyAiAgent.openAgentPanel', async () => {
		await vscode.commands.executeCommand('eyAgent.showPanelTip');
		const panel = vscode.window.createWebviewPanel(
			'eyAgentPanel',
			'eyAgent (Copilot Mode)',
			vscode.ViewColumn.Beside,
			{ enableScripts: true }
		);
		panel.webview.html = getAgentPanelHtmlWithApply();
		panel.webview.onDidReceiveMessage(async (message) => {
			if (message.type === 'ask') {
				const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
				if (!apiKey) {
					panel.webview.postMessage({ type: 'answer', text: 'GPT-4 API Key is not set.' });
					return;
				}
				let answer = '';
				try {
					answer = await callGpt4Api(apiKey, message.text);
					logToFile(context, `Agent panel chat: ${message.text}`);
					lastChatSuggestion = answer;
				} catch (e: any) {
					answer = 'Error: ' + e.message;
					logToFile(context, `Agent panel chat error: ${e.message}`);
				}
				panel.webview.postMessage({ type: 'answer', text: answer });
			}
			if (message.type === 'apply') {
				if (lastChatSuggestion) {
					await applySuggestionToEditor(lastChatSuggestion);
				}
			}
			if (message.type === 'createFileOrFolder') {
				await handleFileFolderCreation(lastChatSuggestion);
			}
		});
	}));

	async function applySuggestionToEditor(suggestion: string) {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor to apply suggestion.');
			return;
		}
		await editor.edit(editBuilder => {
			editBuilder.insert(editor.selection.active, suggestion);
		});
		vscode.window.showInformationMessage('eyAgent: Suggestion applied to editor.');
	}

	async function handleFileFolderCreation(suggestion: string | undefined) {
		if (!suggestion) {
			return;
		}
		// Simple detection: look for code blocks like ```filename.ext\n...code...```
		const fileBlockRegex = /```([\w\/.\\-]+)\n([\s\S]*?)```/g;
		let match;
		let created: string[] = [];
		while ((match = fileBlockRegex.exec(suggestion)) !== null) {
			const filePath = match[1];
			const fileContent = match[2];
			const absPath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0].uri!, filePath);
			const confirm = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: `Create file: ${filePath}?` });
			if (confirm === 'Yes') {
				await vscode.workspace.fs.createDirectory(absPath.with({ path: absPath.path.replace(/\/[^\/]*$/, '') }));
				await vscode.workspace.fs.writeFile(absPath, Buffer.from(fileContent, 'utf8'));
				created.push(filePath);
			}
		}
		if (created.length) {
			vscode.window.showInformationMessage(`eyAgent: Created files/folders: ${created.join(', ')}`);
		}
	}

	function getAgentPanelHtmlWithApply(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>eyAgent Copilot Panel</title>
	<style>
		body { font-family: Segoe UI, sans-serif; background: #1e1e1e; color: #d4d4d4; margin: 0; padding: 0; }
		#header { background: #252526; padding: 10px; font-size: 1.2em; border-bottom: 1px solid #333; }
		#chat { height: 350px; overflow-y: auto; padding: 10px; background: #1e1e1e; }
		#input { display: flex; border-top: 1px solid #333; }
		#inputBox { flex: 1; padding: 10px; background: #252526; color: #d4d4d4; border: none; }
		#sendBtn, #applyBtn, #createBtn { background: #007acc; color: #fff; border: none; padding: 10px 20px; cursor: pointer; margin-left: 5px; }
	</style>
</head>
<body>
	<div id="header">eyAgent (Copilot Mode)</div>
	<div id="chat"></div>
	<div id="input">
		<input id="inputBox" type="text" placeholder="Ask something..." />
		<button id="sendBtn">Send</button>
		<button id="applyBtn">Apply to Editor</button>
		<button id="createBtn">Create Files/Folders</button>
	</div>
	<script>
		const vscode = acquireVsCodeApi();
		const chat = document.getElementById('chat');
		const inputBox = document.getElementById('inputBox');
		const sendBtn = document.getElementById('sendBtn');
		const applyBtn = document.getElementById('applyBtn');
		const createBtn = document.getElementById('createBtn');
		let lastAnswer = '';
		function appendMessage(role, text) {
			const div = document.createElement('div');
			div.textContent = (role === 'user' ? 'You: ' : 'eyAgent: ') + text;
			div.style.margin = '8px 0';
			div.style.color = role === 'user' ? '#9cdcfe' : '#b5cea8';
			chat.appendChild(div);
			chat.scrollTop = chat.scrollHeight;
			if (role === 'assistant') lastAnswer = text;
		}
		sendBtn.onclick = () => {
			const text = inputBox.value.trim();
			if (!text) return;
			appendMessage('user', text);
			vscode.postMessage({ type: 'ask', text });
			inputBox.value = '';
		};
		applyBtn.onclick = () => {
			vscode.postMessage({ type: 'apply' });
		};
		createBtn.onclick = () => {
			vscode.postMessage({ type: 'createFileOrFolder' });
		};
		window.addEventListener('message', event => {
			const msg = event.data;
			if (msg.type === 'answer') {
				appendMessage('assistant', msg.text);
			}
		});
	</script>
</body>
</html>`;
	}

	if (vscode.window.registerWebviewPanelSerializer) {
		vscode.window.registerWebviewPanelSerializer('eyAgentPanel', {
			deserializeWebviewPanel(panel, _state) {
				panel.webview.html = getAgentPanelHtmlWithApply();
				return Promise.resolve();
			}
		});
	}

	vscode.window.onDidChangeActiveTextEditor(() => {
		if (agentModeEnabled) {
			vscode.window.setStatusBarMessage('eyAgent Agent Mode is ON', 3000);
		}
	});

	// Onboarding popup for new users
	const hasShownOnboarding = context.globalState.get<boolean>('eyAgent.onboardingShown');
	if (!hasShownOnboarding) {
		vscode.window.showInformationMessage(
			'Welcome to eyAgent! Set your GPT-4 API key to get started. See GUIDE.md for full instructions.',
			'Set API Key', 'Open Guide'
		).then(selection => {
			if (selection === 'Set API Key') {
				vscode.commands.executeCommand('eyAiAgent.setApiKey');
			} else if (selection === 'Open Guide') {
				vscode.commands.executeCommand('vscode.open', vscode.Uri.file(context.asAbsolutePath('GUIDE.md')));
			}
		});
		context.globalState.update('eyAgent.onboardingShown', true);
	}

	// In-editor tip: show status bar tip for agent mode
	function showAgentModeTip() {
		vscode.window.setStatusBarMessage('eyAgent: Toggle Agent Mode from Command Palette for auto-suggestions!', 8000);
	}

	// In-editor tip: show tip when user opens the agent panel
	context.subscriptions.push(
		vscode.commands.registerCommand('eyAgent.showPanelTip', () => {
			vscode.window.showInformationMessage('Type your question in the chat panel and press Send.');
		})
	);

	// Show agent mode tip on activation
	showAgentModeTip();

	// Show panel tip when agent panel is opened
	context.subscriptions.push(vscode.commands.registerCommand('eyAiAgent.openAgentPanel', async () => {
		await vscode.commands.executeCommand('eyAgent.showPanelTip');
		// Call the original openAgentPanel logic
		const panel = vscode.window.createWebviewPanel(
			'eyAgentPanel',
			'eyAgent (Copilot Mode)',
			vscode.ViewColumn.Beside,
			{ enableScripts: true }
		);
		panel.webview.html = getAgentPanelHtmlWithApply();
		panel.webview.onDidReceiveMessage(async (message) => {
			if (message.type === 'ask') {
				const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
				if (!apiKey) {
					panel.webview.postMessage({ type: 'answer', text: 'GPT-4 API Key is not set.' });
					return;
				}
				let answer = '';
				try {
					answer = await callGpt4Api(apiKey, message.text);
					logToFile(context, `Agent panel chat: ${message.text}`);
				} catch (e: any) {
					answer = 'Error: ' + e.message;
					logToFile(context, `Agent panel chat error: ${e.message}`);
				}
				panel.webview.postMessage({ type: 'answer', text: answer });
			}
		});
	}));

	// === CONTEXT ATTACHMENT, INDEXING, AND CACHING ===

	// In-memory context cache
	let contextCache: { [key: string]: string } = {};

	// Index all files in workspace (simple text index)
	async function indexWorkspace() {
		if (!vscode.workspace.workspaceFolders) {
			return;
		}
		const folder = vscode.workspace.workspaceFolders[0];
		const files = await vscode.workspace.findFiles('**/*.{ts,js,py,java,cpp,cs,go,rb,php,rs,md,txt}', '**/node_modules/**', 100);
		for (const file of files) {
			try {
				const doc = await vscode.workspace.openTextDocument(file);
				contextCache[file.fsPath] = doc.getText();
			} catch {}
		}
	}

	// Command: Attach context (user picks files/folders to add as context)
	const attachContextDisposable = vscode.commands.registerCommand('eyAiAgent.attachContext', async () => {
		await indexWorkspace();
		const fileItems = Object.keys(contextCache).map(f => ({ label: f, picked: false }));
		const picks = await vscode.window.showQuickPick(fileItems, { canPickMany: true, placeHolder: 'Select files to attach as context' });
		if (!picks || picks.length === 0) {
			vscode.window.showInformationMessage('No context attached.');
			return;
		}
		const contextText = picks.map(p => `File: ${p.label}\n${contextCache[p.label]}`).join('\n\n');
		context.globalState.update('eyAgent.attachedContext', contextText);
		vscode.window.showInformationMessage('Context attached for next AI request.');
	});
	context.subscriptions.push(attachContextDisposable);

	// Use attached context in all AI calls
	async function getAttachedContext(): Promise<string> {
		return (context.globalState.get('eyAgent.attachedContext') as string) || '';
	}

	// Enhance all AI commands to use attached context
	async function callGpt4ApiWithContext1(apiKey: string, prompt: string): Promise<string> {
		const attached = await getAttachedContext();
		const fullPrompt = attached ? `CONTEXT:\n${attached}\n\nUSER PROMPT:\n${prompt}` : prompt;
		return callGpt4Api(apiKey, fullPrompt);
	}

	// Replace all usages of callGpt4Api with callGpt4ApiWithContext in AI commands (example for chat):
	// ...in chatDisposable...
	const chatDisposableWithContext = vscode.commands.registerCommand('eyAiAgent.askGpt4', async () => {
		const question = await vscode.window.showInputBox({ prompt: 'Ask GPT-4 (eyAgent):', ignoreFocusOut: true });
		if (!question) {
			return;
		}
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		let answer = '';
		try {
			answer = await callGpt4ApiWithContext(apiKey, question);
			logToFile(context, `Chat/Ask: ${question}`);
		} catch (e: any) {
			answer = 'Error: ' + e.message;
			logToFile(context, `Chat/Ask error: ${e.message}`);
		}
		const panel = vscode.window.createOutputChannel('eyAgent Chat');
		panel.appendLine('Q: ' + question);
		panel.appendLine('A: ' + answer);
		panel.show(true);
	});
	context.subscriptions.push(chatDisposableWithContext);

	// Explain code command
	const explainDisposableWithContext = vscode.commands.registerCommand('eyAiAgent.explainCode', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor.');
			return;
		}
		const selection = editor.selection;
		const code = editor.document.getText(selection.isEmpty ? editor.document.getWordRangeAtPosition(selection.active) || selection : selection);
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		let answer = '';
		try {
			answer = await callGpt4ApiWithContext(apiKey, `Explain the following code:\n${code}`);
			logToFile(context, `Explain code: ${code}`);
		} catch (e: any) {
			answer = 'Error: ' + e.message;
			logToFile(context, `Explain code error: ${e.message}`);
		}
		vscode.window.showInformationMessage(answer, { modal: true });
	});
	context.subscriptions.push(explainDisposableWithContext);

	// Refactor code command
	const refactorDisposableWithContext = vscode.commands.registerCommand('eyAiAgent.refactorCode', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor.');
			return;
		}
		const selection = editor.selection;
		const code = editor.document.getText(selection.isEmpty ? editor.document.getWordRangeAtPosition(selection.active) || selection : selection);
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		let answer = '';
		try {
			answer = await callGpt4ApiWithContext(apiKey, `Refactor the following code and explain the changes:\n${code}`);
			logToFile(context, `Refactor code: ${code}`);
		} catch (e: any) {
			answer = 'Error: ' + e.message;
			logToFile(context, `Refactor code error: ${e.message}`);
		}
		vscode.window.showInformationMessage(answer, { modal: true });
	});
	context.subscriptions.push(refactorDisposableWithContext);

	// Generate documentation command
	const docDisposableWithContext = vscode.commands.registerCommand('eyAiAgent.generateDoc', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor.');
			return;
		}
		const selection = editor.selection;
		const code = editor.document.getText(selection.isEmpty ? editor.document.getWordRangeAtPosition(selection.active) || selection : selection);
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		let answer = '';
		try {
			answer = await callGpt4ApiWithContext(apiKey, `Write documentation comments for the following code:\n${code}`);
			logToFile(context, `Generate doc: ${code}`);
		} catch (e: any) {
			answer = 'Error: ' + e.message;
			logToFile(context, `Generate doc error: ${e.message}`);
		}
		vscode.window.showInformationMessage(answer, { modal: true });
	});
	context.subscriptions.push(docDisposableWithContext);

	// Explain error command
	const explainErrorDisposableWithContext = vscode.commands.registerCommand('eyAiAgent.explainError', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor.');
			return;
		}
		const selection = editor.selection;
		const errorText = editor.document.getText(selection.isEmpty ? editor.document.getWordRangeAtPosition(selection.active) || selection : selection);
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		let answer = '';
		try {
			answer = await callGpt4ApiWithContext(apiKey, `Explain this error message and how to fix it:\n${errorText}`);
			logToFile(context, `Explain error: ${errorText}`);
		} catch (e: any) {
			answer = 'Error: ' + e.message;
			logToFile(context, `Explain error error: ${e.message}`);
		}
		vscode.window.showInformationMessage(answer, { modal: true });
	});
	context.subscriptions.push(explainErrorDisposableWithContext);

	// Command to clear attached context
	const clearContextDisposable = vscode.commands.registerCommand('eyAiAgent.clearAttachedContext', async () => {
		context.globalState.update('eyAgent.attachedContext', undefined);
		vscode.window.showInformationMessage('eyAgent: Attached context cleared.');
	});
	context.subscriptions.push(clearContextDisposable);

	// === ADVANCED CONTEXT: REAL EMBEDDINGS, BACKGROUND INDEXING, CONTEXT SIZE MANAGEMENT ===

	// --- Real Embeddings (OpenAI API) ---
	async function getEmbedding(text: string, apiKey: string): Promise<number[] | undefined> {
		try {
			const response = await fetch('https://api.openai.com/v1/embeddings', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`
				},
				body: JSON.stringify({ model: 'text-embedding-ada-002', input: text })
			});
			if (!response.ok) { return undefined; }
			const data = await response.json();
			return data.data?.[0]?.embedding;
		} catch { return undefined; }
	}

	// --- Background Indexing ---
	let embeddingIndex: { file: string, embedding: number[] }[] = [];
	async function buildEmbeddingIndex(apiKey: string) {
		await indexWorkspace();
		embeddingIndex = [];
		for (const [file, text] of Object.entries(contextCache)) {
			const emb = await getEmbedding(text.slice(0, 2000), apiKey); // Limit size for API
			if (emb) { embeddingIndex.push({ file, embedding: emb }); }
		}
	}

	// --- Cosine Similarity ---
	function cosineSimilarity(a: number[], b: number[]): number {
		let dot = 0, normA = 0, normB = 0;
		for (let i = 0; i < a.length; i++) {
			dot += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}
		return dot / (Math.sqrt(normA) * Math.sqrt(normB));
	}

	// --- Command: Attach context using real embeddings ---
	const attachEmbeddingContextDisposable = vscode.commands.registerCommand('eyAiAgent.attachEmbeddingContext', async () => {
		const apiKey = await context.secrets.get(GPT4_API_KEY_SECRET);
		if (!apiKey) {
			vscode.window.showWarningMessage('GPT-4 API Key is not set.');
			return;
		}
		await buildEmbeddingIndex(apiKey);
		const query = await vscode.window.showInputBox({ prompt: 'Describe what you want context for (semantic, real embedding)' });
		if (!query) {
			return;
		}
		const queryEmbedding = await getEmbedding(query, apiKey);
		if (!queryEmbedding) {
			vscode.window.showWarningMessage('Failed to get embedding for query.');
			return;
		}
		const scored = embeddingIndex.map(e => ({ file: e.file, score: cosineSimilarity(e.embedding, queryEmbedding) }))
			.sort((a, b) => b.score - a.score)
			.slice(0, 5);
		if (!scored.length) {
			vscode.window.showInformationMessage('No relevant files found for your query.');
			return;
		}
		const contextText = scored.map(f => `File: ${f.file}\n${contextCache[f.file]}`).join('\n\n');
		context.globalState.update('eyAgent.attachedContext', contextText);
		vscode.window.showInformationMessage('Best-matching context (real embedding) attached for next AI request.');
	});
	context.subscriptions.push(attachEmbeddingContextDisposable);

	// --- Context Size Management ---
	function trimContextToTokenLimit(contextText: string, maxTokens: number = 2000): string {
		// Approximate: 1 token ~ 4 chars (for English)
		const maxLen = maxTokens * 4;
		if (contextText.length > maxLen) {
			return contextText.slice(0, maxLen) + '\n... [context trimmed]';
		}
		return contextText;
	}

	// Only one implementation of callGpt4ApiWithContext should exist!
	// Remove any duplicate or conflicting definitions above this point.
	async function callGpt4ApiWithContext(apiKey: string, prompt: string): Promise<string> {
		const attached = await getAttachedContext();
		const trimmed = attached ? trimContextToTokenLimit(attached, 2000) : '';
		const fullPrompt = trimmed ? `CONTEXT:\n${trimmed}\n\nUSER PROMPT:\n${prompt}` : prompt;
		return callGpt4Api(apiKey, fullPrompt);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
