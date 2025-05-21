// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ApiClient } from './models/apiClient';
import { InlineCompletionProvider } from './providers/inlineCompletionProvider';
import { ApiKeyManager } from './utils/apiKeyManager';
import { ChatViewProvider } from './webviews/chatViewProvider';
import { SettingsViewProvider } from './webviews/settingsViewProvider';
import { AICodeActionProvider } from './providers/codeActionProvider';
import { InlineWidgetProvider } from './providers/inlineWidgetProvider';

// Log file name for local logging
const LOG_FILE = 'eyAgent.log';

/**
 * Log message to file for troubleshooting
 * @param context Extension context
 * @param message Message to log
 */
function logToFile(context: vscode.ExtensionContext, message: string) {
    const logPath = path.join(context.globalStorageUri.fsPath, LOG_FILE);
    fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true }); // Ensure directory exists
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`); // Append log
}

/**
 * Main extension activation function
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('eyAgent extension is now active');
    
    try {
        // Initialize API key manager
        const apiKeyManager = new ApiKeyManager(context);
        
        // Initialize API client
        const apiClient = new ApiClient(context);
        
        // Initialize inline completion provider
        const inlineCompletionProvider = new InlineCompletionProvider(apiClient);
        
        // Initialize webview providers
        const chatViewProvider = new ChatViewProvider(context.extensionUri, apiClient);
        const settingsViewProvider = new SettingsViewProvider(context.extensionUri, apiKeyManager);
        
        // Register webview providers
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                'eyAgentChatView',
                chatViewProvider
            )
        );
        
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                'eyAgentSettingsView',
                settingsViewProvider
            )
        );
        
        // Register inline completion provider for all languages
        context.subscriptions.push(
            vscode.languages.registerInlineCompletionItemProvider(
                { pattern: '**' },
                inlineCompletionProvider
            )
        );
        
        // Register inline suggestion widget via CodeLens
        context.subscriptions.push(
            vscode.languages.registerCodeLensProvider(
                { scheme: 'file', pattern: '**/*.{ts,js,py,java,cs}' },
                new InlineWidgetProvider(inlineCompletionProvider)
            )
        );
        
        // Create status bar item
        const statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        statusBarItem.text = '$(lightbulb) eyAgent';
        statusBarItem.tooltip = 'eyAgent AI Assistant';
        statusBarItem.command = 'eyAiAgent.showSidebar';
        
        if (vscode.workspace.getConfiguration('eyAgent').get<boolean>('showStatusBarItem', true)) {
            statusBarItem.show();
        }
        
        context.subscriptions.push(statusBarItem);
        
        // Register commands
        registerCommands(context, {
            apiClient, 
            inlineCompletionProvider,
            chatViewProvider,
            settingsViewProvider,
            apiKeyManager,
            statusBarItem
        });
        
        // Register AI code actions (lightbulb quick fixes)
        context.subscriptions.push(
            vscode.languages.registerCodeActionsProvider(
                { scheme: 'file', pattern: '**/*.{ts,js,py,java,cs}' },
                new AICodeActionProvider(apiClient),
                AICodeActionProvider.metadata
            )
        );
        
        logToFile(context, 'Extension activated successfully');
    } catch (error) {
        console.error('Failed to activate eyAgent extension:', error);
        logToFile(context, `Activation error: ${error instanceof Error ? error.message : String(error)}`);
        
        // Show error notification
        vscode.window.showErrorMessage(
            'Failed to activate eyAgent extension. See log for details.'
        );
    }
}

/**
 * Register all extension commands
 */
function registerCommands(
    context: vscode.ExtensionContext,
    providers: {
        apiClient: ApiClient;
        inlineCompletionProvider: InlineCompletionProvider;
        chatViewProvider: ChatViewProvider;
        settingsViewProvider: SettingsViewProvider;
        apiKeyManager: ApiKeyManager;
        statusBarItem: vscode.StatusBarItem;
    }
): void {
    const {
        apiClient,
        inlineCompletionProvider,
        chatViewProvider,
        settingsViewProvider,
        apiKeyManager,
        statusBarItem
    } = providers;
    
    // Register all extension commands
    
    // Set API Key command
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.setApiKey', async () => {
            const provider = await vscode.window.showQuickPick(
                ['OpenAI', 'Anthropic', 'Google', 'Custom'],
                { placeHolder: 'Select API provider' }
            );
            
            if (!provider) { return; }
            
            const apiKey = await vscode.window.showInputBox({
                prompt: `Enter ${provider} API Key`,
                password: true,
                placeHolder: 'API Key',
                ignoreFocusOut: true
            });
            
            if (!apiKey) { return; }
            
            const keyName = provider === 'OpenAI' ? 'openaiApiKey' :
                provider === 'Anthropic' ? 'anthropicApiKey' :
                provider === 'Google' ? 'googleApiKey' : 'customApiKey';
            
            await apiKeyManager.setApiKey(keyName, apiKey);
            
            vscode.window.showInformationMessage(`${provider} API Key saved`);
            
            // Refresh settings view
            settingsViewProvider.refresh();
        })
    );
    
    // Manage Models command
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.manageModels', async () => {
            const config = vscode.workspace.getConfiguration('eyAgent');
            
            const currentModel = config.get<string>('defaultModel');
            const models = [
                { label: 'GPT-4', value: 'gpt-4' },
                { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
                { label: 'Claude 3 Opus', value: 'claude-3-opus' },
                { label: 'Claude 3 Sonnet', value: 'claude-3-sonnet' },
                { label: 'Gemini Pro', value: 'gemini-pro' },
                { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
                { label: 'Custom Model', value: 'custom' }
            ];
            
            const selectedModel = await vscode.window.showQuickPick(
                models.map(model => ({
                    label: model.label,
                    description: model.value === currentModel ? '(current)' : '',
                    value: model.value
                })),
                { placeHolder: 'Select default AI model' }
            );
            
            if (!selectedModel) { return; };
            
            await config.update('defaultModel', selectedModel.value, vscode.ConfigurationTarget.Global);
            
            if (selectedModel.value === 'custom') {
                const endpoint = await vscode.window.showInputBox({
                    prompt: 'Enter custom model API endpoint URL',
                    placeHolder: 'https://api.example.com/v1/completions',
                    ignoreFocusOut: true,
                    value: config.get<string>('customModelEndpoint', '')
                });
                
                if (endpoint) {
                    await config.update('customModelEndpoint', endpoint, vscode.ConfigurationTarget.Global);
                }
            }
            
            vscode.window.showInformationMessage(`Default model set to ${selectedModel.label}`);
        })
    );
    
    // Show Sidebar command
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.showSidebar', () => {
            // Focus the chat view
            vscode.commands.executeCommand('eyAgentChatView.focus');
        })
    );
    
    // Toggle Inline Completions command
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.toggleInlineCompletions', () => {
            const newValue = !inlineCompletionProvider.isEnabled();
            inlineCompletionProvider.setEnabled(newValue);
            vscode.window.showInformationMessage(
                `Inline completions ${newValue ? 'enabled' : 'disabled'}`
            );
        })
    );
    
    // Clear Chat History command
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.clearChatHistory', () => {
            chatViewProvider.clearHistory();
            vscode.window.showInformationMessage('Chat history cleared');
        })
    );
    
    // Copilot-like inline suggestion controls
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.triggerInlineSuggestion', () => {
            vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.acceptInlineSuggestion', () => {
            vscode.commands.executeCommand('inlineSuggest.accept');
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.nextInlineSuggestion', () => {
            vscode.commands.executeCommand('inlineSuggest.showNext');
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.prevInlineSuggestion', () => {
            vscode.commands.executeCommand('inlineSuggest.showPrevious');
        })
    );
    
    // Register code analysis commands
    registerCodeAnalysisCommands(context, apiClient);
}

/**
 * Register commands for code analysis (explain, refactor, etc.)
 */
function registerCodeAnalysisCommands(
    context: vscode.ExtensionContext,
    apiClient: ApiClient
): void {
    // Explain Code command
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.explainCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }
            const selected = editor.document.getText(editor.selection);
            if (!selected) { return; }
            const model = vscode.workspace.getConfiguration('eyAgent').get<string>('defaultModel') || 'gpt-4';
            const systemPrompt = `You are an expert programmer tasked with explaining code. Provide a clear, concise explanation of the selected code.`;
            const response = await apiClient.callModel(model, selected, { systemPrompt, temperature: 0.1 });
            if (response.error) { vscode.window.showErrorMessage(`Error: ${response.error}`); return; }
            const doc = await vscode.workspace.openTextDocument({ content: `# Explanation\n\n${response.text}`, language: 'markdown' });
            await vscode.window.showTextDocument(doc, { preview: true });
        })
    );

    // Refactor Code command
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.refactorCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }
            const selected = editor.document.getText(editor.selection);
            if (!selected) { return; }
            const model = vscode.workspace.getConfiguration('eyAgent').get<string>('defaultModel') || 'gpt-4';
            const language = editor.document.languageId;
            const systemPrompt = `You are an expert in ${language} code refactoring. Refactor the selected code for readability and best practices.`;
            const response = await apiClient.callModel(model, selected, { systemPrompt, temperature: 0.1 });
            if (response.error) { vscode.window.showErrorMessage(`Error: ${response.error}`); return; }
            const doc = await vscode.workspace.openTextDocument({ content: response.text, language });
            await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
        })
    );

    // Generate Documentation command
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.generateDoc', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }
            const selected = editor.document.getText(editor.selection);
            if (!selected) { return; }
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Generating documentation...', cancellable: false },
                async () => {
                    const model = vscode.workspace.getConfiguration('eyAgent').get<string>('defaultModel') || 'gpt-4';
                    const language = editor.document.languageId;
                    const systemPrompt = `You are an expert programmer tasked with creating documentation. Analyze the selected ${language} code and generate comprehensive documentation, including purpose, parameters, return values, and examples.`;
                    const response = await apiClient.callModel(model, selected, { systemPrompt, temperature: 0.1 });
                    if (response.error) { vscode.window.showErrorMessage(`Error: ${response.error}`); return; }
                    const doc = await vscode.workspace.openTextDocument({ content: response.text, language: 'markdown' });
                    await vscode.window.showTextDocument(doc, { preview: true });
                }
            );
        })
    );

    // Explain Error command
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.explainError', async () => {
            const errorMsg = await vscode.window.showInputBox({ prompt: 'Enter the error message to explain', ignoreFocusOut: true });
            if (!errorMsg) { return; }
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Explaining error...', cancellable: false },
                async () => {
                    const model = vscode.workspace.getConfiguration('eyAgent').get<string>('defaultModel') || 'gpt-4';
                    const systemPrompt = `You are an expert programmer. Explain this error message clearly: ${errorMsg}`;
                    const response = await apiClient.callModel(model, errorMsg, { systemPrompt, temperature: 0.1 });
                    if (response.error) { vscode.window.showErrorMessage(`Error: ${response.error}`); return; }
                    const doc = await vscode.workspace.openTextDocument({ content: `# Error Explanation

${response.text}`, language: 'markdown' });
                    await vscode.window.showTextDocument(doc, { preview: true });
                }
            );
        })
    );

    // Generate Unit Test command
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.generateUnitTest', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }
            const selected = editor.document.getText(editor.selection);
            if (!selected) { return; }
            const language = editor.document.languageId;
            const frameworks: Record<string,string[]> = {
                typescript: ['Jest','Mocha'], javascript: ['Jest','Mocha'], python: ['pytest','unittest'], java: ['JUnit'], csharp: ['xUnit']
            };
            const choices = frameworks[language] || ['Default'];
            const framework = await vscode.window.showQuickPick(choices, { placeHolder: 'Select a testing framework' });
            if (!framework) { return; }
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Generating unit tests...', cancellable: false },
                async () => {
                    const model = vscode.workspace.getConfiguration('eyAgent').get<string>('defaultModel') || 'gpt-4';
                    const systemPrompt = `You are an expert in writing unit tests for ${language}. Generate tests using ${framework} for the selected code.`;
                    const response = await apiClient.callModel(model, selected, { systemPrompt, temperature: 0.1 });
                    if (response.error) { vscode.window.showErrorMessage(`Error: ${response.error}`); return; }
                    const doc = await vscode.workspace.openTextDocument({ content: response.text, language });
                    await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
                }
            );
        })
    );

    // Insert Suggestion at Cursor command
    context.subscriptions.push(
        vscode.commands.registerCommand('eyAiAgent.insertSuggestion', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }
            const position = editor.selection.active;
            const docText = editor.document.getText();
            const offset = editor.document.offsetAt(position);
            const prompt = docText.slice(0, offset) + '[CURSOR]';
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Generating suggestion...', cancellable: false },
                async () => {
                    const model = vscode.workspace.getConfiguration('eyAgent').get<string>('defaultModel') || 'gpt-4';
                    const systemPrompt = `You are a helpful assistant. Provide code to replace [CURSOR].`;
                    const response = await apiClient.callModel(model, prompt, { systemPrompt, temperature: 0.1 });
                    if (response.error) { vscode.window.showErrorMessage(`Error: ${response.error}`); return; }
                    const text = response.text.trim();
                    await editor.edit(edit => edit.insert(position, text));
                }
            );
        })
    );

    // End of code analysis commands
}

/**
 * Extension deactivation function
 */
export function deactivate(): void {
    console.log('eyAgent extension is now deactivated');
}

/*
TODO:
OAuth flows (would need integration with GitHub’s OAuth and token storage).
Privacy/redaction controls (settings + context filter).
Per-language metrics and telemetry dashboards.
Sidebar toolbar with copy/insert buttons and feedback: update chat.js to add buttons on each message bubble.
*/