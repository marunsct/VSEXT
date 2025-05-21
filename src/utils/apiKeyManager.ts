// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { SUPPORTED_MODELS, AIModel } from '../models/aiModels';

/**
 * Class to manage API keys for different models
 */
export class ApiKeyManager {
    /**
     * Creates a new API key manager
     * @param context VS Code extension context
     */
    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Set API key for a model
     * @param modelId Model ID
     * @param apiKey API key
     */
    public async setApiKey(modelId: string, apiKey: string): Promise<boolean> {
        const model = SUPPORTED_MODELS.find(m => m.id === modelId);
        if (!model) {
            vscode.window.showErrorMessage(`Unknown model: ${modelId}`);
            return false;
        }

        try {
            await this.context.secrets.store(model.secretKeyName, apiKey);
            vscode.window.showInformationMessage(`${model.name} API key saved successfully.`);
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save API key: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Remove API key for a model
     * @param modelId Model ID
     */
    public async removeApiKey(modelId: string): Promise<boolean> {
        const model = SUPPORTED_MODELS.find(m => m.id === modelId);
        if (!model) {
            vscode.window.showErrorMessage(`Unknown model: ${modelId}`);
            return false;
        }

        try {
            await this.context.secrets.delete(model.secretKeyName);
            vscode.window.showInformationMessage(`${model.name} API key removed.`);
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to remove API key: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Check if API key is set for a model
     * @param modelId Model ID
     */
    public async hasApiKey(modelId: string): Promise<boolean> {
        const model = SUPPORTED_MODELS.find(m => m.id === modelId);
        if (!model) {
            return false;
        }

        const key = await this.context.secrets.get(model.secretKeyName);
        return !!key;
    }

    /**
     * Open a dialog to manage API keys
     */
    public async showApiKeyManagementDialog(): Promise<void> {
        const items: vscode.QuickPickItem[] = [];
        
        for (const model of SUPPORTED_MODELS) {
            const hasKey = await this.hasApiKey(model.id);
            items.push({
                label: model.name,
                description: `${model.provider} - ${hasKey ? 'API key set' : 'No API key set'}`,
                detail: model.description
            });
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a model to manage its API key',
            canPickMany: false
        });

        if (!selected) {
            return;
        }

        const modelId = SUPPORTED_MODELS.find(m => m.name === selected.label)?.id;
        if (!modelId) {
            return;
        }

        const hasKey = await this.hasApiKey(modelId);
        const action = await vscode.window.showQuickPick(
            [
                { label: 'Set API Key', id: 'set' },
                ...(hasKey ? [{ label: 'Remove API Key', id: 'remove' }] : [])
            ],
            { placeHolder: `Manage API key for ${selected.label}` }
        );

        if (!action) {
            return;
        }

        if (action.id === 'set') {
            const apiKey = await vscode.window.showInputBox({
                prompt: `Enter API key for ${selected.label}`,
                password: true,
                ignoreFocusOut: true
            });

            if (apiKey) {
                await this.setApiKey(modelId, apiKey);
            }
        } else if (action.id === 'remove') {
            await this.removeApiKey(modelId);
        }
    }
}
