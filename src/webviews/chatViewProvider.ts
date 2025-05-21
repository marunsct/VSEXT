// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ApiClient } from '../models/apiClient';
import { getNonce } from '../utils/nonce';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Provider for the chat view in the sidebar
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'eyAgentChatView';
    private _view?: vscode.WebviewView;
    private _chatHistory: { role: string, content: string }[] = [];

    /**
     * Creates a new chat view provider
     * @param extensionUri Extension URI
     * @param apiClient API client
     */
    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly apiClient: ApiClient
    ) {}

    /**
     * Resolve the webview view
     * @param webviewView Webview view
     * @param context Context
     * @param token Cancellation token
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this._sendMessage(data.message);
                    break;
                case 'clearChat':
                    this._clearChat();
                    break;
                case 'insertCode':
                    await this._insertCodeToEditor(data.code);
                    break;
            }
        });
    }

    /**
     * Clear the chat history
     */
    private _clearChat(): void {
        this._chatHistory = [];
        if (this._view) {
            this._view.webview.postMessage({ type: 'clearChat' });
        }
    }

    /**
     * Clear the chat history (public wrapper)
     */
    public clearHistory(): void {
        this._clearChat();
    }

    /**
     * Insert code into the active editor
     * @param code Code to insert
     */
    private async _insertCodeToEditor(code: string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, code);
            });
            vscode.window.showInformationMessage('Code inserted into editor');
        } else {
            vscode.window.showErrorMessage('No active editor to insert code into');
        }
    }

    /**
     * Send a message to the model and display the response
     * @param message Message to send
     */
    private async _sendMessage(message: string): Promise<void> {
        if (!this._view) {
            return;
        }

        // Add user message to history
        this._chatHistory.push({ role: 'user', content: message });
        
        // Notify webview to add user message
        this._view.webview.postMessage({
            type: 'addMessage',
            message: {
                role: 'user',
                content: message
            }
        });

        // Show loading indicator
        this._view.webview.postMessage({ type: 'setLoading', isLoading: true });

        try {
            // Get selected model from settings
            const modelId = vscode.workspace.getConfiguration('eyAgent').get<string>('defaultModel') || 'gpt-4';
            
            // Add workspace context if needed
            const shouldAddContext = this._chatHistory.length === 1; // Only for first message
            let systemPrompt = 'You are an AI coding assistant helping with programming tasks.';
            let messages = [...this._chatHistory];
            
            if (shouldAddContext) {
                const workspaceContext = await this._getWorkspaceContext();
                if (workspaceContext) {
                    systemPrompt += ' Here is some context from the current workspace:\n\n' + workspaceContext;
                }
            }

            // Call the API
            const response = await this.apiClient.callModel(modelId, message, {
                systemPrompt,
                messages,
                maxTokens: 1000
            });

            // Add assistant message to history
            const assistantMessage = {
                role: 'assistant',
                content: response.error || response.text
            };
            this._chatHistory.push(assistantMessage);

            // Notify webview to add assistant message
            this._view.webview.postMessage({
                type: 'addMessage',
                message: assistantMessage
            });
        } catch (err) {
            // Add error message
            const errorMessage = {
                role: 'assistant',
                content: `Error: ${err instanceof Error ? err.message : String(err)}`
            };
            this._chatHistory.push(errorMessage);
            
            // Notify webview to add error message
            this._view.webview.postMessage({
                type: 'addMessage',
                message: errorMessage
            });
        } finally {
            // Hide loading indicator
            this._view.webview.postMessage({ type: 'setLoading', isLoading: false });
        }
    }

    /**
     * Get context from the workspace for the chat
     */
    private async _getWorkspaceContext(): Promise<string | undefined> {
        try {
            // Get active editor content as context
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return undefined;
            }

            const document = editor.document;
            const text = document.getText();
            
            // If file is too large, only include visible portion
            if (text.length > 5000) {
                const visibleRanges = editor.visibleRanges;
                if (visibleRanges.length > 0) {
                    const visibleText = document.getText(visibleRanges[0]);
                    return `File: ${document.fileName} (visible portion)\n\n${visibleText}`;
                }
            }
            
            return `File: ${document.fileName}\n\n${text}`;
        } catch (error) {
            console.error('Error getting workspace context:', error);
            return undefined;
        }
    }

    /**
     * Get HTML for the webview
     * @param webview Webview
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        // Load HTML template from external file
        const templatePath = path.join(this.extensionUri.fsPath, 'src', 'webviews', 'templates', 'chat.html');
        let html = fs.readFileSync(templatePath, 'utf8');
        // Replace placeholders
        html = html.replace(/\$\{nonce\}/g, nonce)
                   .replace(/\$\{cspSource\}/g, webview.cspSource);
        return html;
    }
}
