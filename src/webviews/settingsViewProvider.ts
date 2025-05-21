// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { SUPPORTED_MODELS } from '../models/aiModels';
import { ApiKeyManager } from '../utils/apiKeyManager';
import { getNonce } from '../utils/nonce';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Provider for the settings view in the sidebar
 */
export class SettingsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'eyAgentSettingsView';
    private _view?: vscode.WebviewView;

    /**
     * Creates a new settings view provider
     * @param extensionUri Extension URI
     * @param apiKeyManager API key manager
     */
    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly apiKeyManager: ApiKeyManager
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
                case 'setApiKey':
                    await this._setApiKey(data.modelId, data.apiKey);
                    break;
                case 'removeApiKey':
                    await this._removeApiKey(data.modelId);
                    break;
                case 'setDefaultModel':
                    await this._setDefaultModel(data.modelId);
                    break;
                case 'setCustomEndpoint':
                    await this._setCustomEndpoint(data.endpoint);
                    break;
                case 'refresh':
                    await this._refreshView();
                    break;
                case 'toggleInlineCompletions':
                    await this._toggleInlineCompletions(data.enabled);
                    break;
            }
        });
    }

    /**
     * Toggle inline completions
     * @param enabled Whether inline completions should be enabled
     */
    private async _toggleInlineCompletions(enabled: boolean): Promise<void> {
        await vscode.workspace.getConfiguration('eyAgent').update('inlineCompletions.enabled', enabled, vscode.ConfigurationTarget.Global);
        vscode.commands.executeCommand('eyAiAgent.toggleInlineCompletions');
    }

    /**
     * Set API key for a model
     * @param modelId Model ID
     * @param apiKey API key
     */
    private async _setApiKey(modelId: string, apiKey: string): Promise<void> {
        await this.apiKeyManager.setApiKey(modelId, apiKey);
        await this._refreshView();
    }

    /**
     * Remove API key for a model
     * @param modelId Model ID
     */
    private async _removeApiKey(modelId: string): Promise<void> {
        await this.apiKeyManager.removeApiKey(modelId);
        await this._refreshView();
    }

    /**
     * Set default model
     * @param modelId Model ID
     */
    private async _setDefaultModel(modelId: string): Promise<void> {
        await vscode.workspace.getConfiguration('eyAgent').update('defaultModel', modelId, vscode.ConfigurationTarget.Global);
        await this._refreshView();
    }

    /**
     * Set custom endpoint
     * @param endpoint Custom endpoint URL
     */
    private async _setCustomEndpoint(endpoint: string): Promise<void> {
        await vscode.workspace.getConfiguration('eyAgent').update('customModelEndpoint', endpoint, vscode.ConfigurationTarget.Global);
        await this._refreshView();
    }

    /**
     * Refresh the view
     */
    private async _refreshView(): Promise<void> {
        if (!this._view) {
            return;
        }

        // Get current settings
        const defaultModel = vscode.workspace.getConfiguration('eyAgent').get<string>('defaultModel') || 'gpt-4';
        const customEndpoint = vscode.workspace.getConfiguration('eyAgent').get<string>('customModelEndpoint') || '';
        const inlineCompletionsEnabled = vscode.workspace.getConfiguration('eyAgent').get<boolean>('inlineCompletions.enabled') ?? true;

        // Get API key status for each model
        const modelStatus: Record<string, boolean> = {};
        for (const model of SUPPORTED_MODELS) {
            modelStatus[model.id] = await this.apiKeyManager.hasApiKey(model.id);
        }

        // Send data to webview
        this._view.webview.postMessage({
            type: 'refreshSettings',
            settings: {
                defaultModel,
                customEndpoint,
                inlineCompletionsEnabled,
                modelStatus
            }
        });
    }

    /**
     * Public wrapper to refresh the settings view
     */
    public refresh(): void {
        this._refreshView();
    }

    /**
     * Get HTML for the webview
     * @param webview Webview
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        // Load HTML template
        const templatePath = path.join(this.extensionUri.fsPath, 'src', 'webviews', 'templates', 'settings.html');
        let html = fs.readFileSync(templatePath, 'utf8');
        // Replace placeholders
        html = html.replace(/\$\{nonce\}/g, nonce)
                   .replace(/\$\{cspSource\}/g, webview.cspSource);
        return html;
    }
}
