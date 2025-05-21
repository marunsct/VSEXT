// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import fetch from 'node-fetch';
import * as vscode from 'vscode';
import { AIModel, ApiRequest, ApiResponse, getModelById } from './aiModels';

/**
 * API client for calling different AI models
 */
export class ApiClient {
    /**
     * Creates a new API client instance
     * @param context VS Code extension context
     */
    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Call the specified AI model with a prompt
     * @param modelId The model ID to use
     * @param prompt The prompt text
     * @param options Additional options
     */
    public async callModel(
        modelId: string, 
        prompt: string, 
        options: {
            systemPrompt?: string; 
            maxTokens?: number; 
            temperature?: number;
            endpoint?: string;
            messages?: Array<{role: string, content: string}>;
        } = {}
    ): Promise<ApiResponse> {
        const model = getModelById(modelId);
        if (!model) {
            return {
                text: 'Error: Invalid model ID',
                model: modelId,
                error: 'Invalid model ID'
            };
        }

        const apiKey = await this.context.secrets.get(model.secretKeyName);
        if (!apiKey) {
            return {
                text: `Error: No API key found for ${model.name}. Please set your API key in the extension settings.`,
                model: model.id,
                error: 'No API key found'
            };
        }

        // Use custom endpoint if provided in options, or from settings for custom model,
        // otherwise use the default endpoint
        let endpoint = options.endpoint || model.defaultEndpoint;
        if (model.id === 'custom') {
            const customEndpoint = vscode.workspace.getConfiguration('eyAgent').get<string>('customModelEndpoint');
            if (customEndpoint) {
                endpoint = customEndpoint;
            }
        }

        const maxTokens = options.maxTokens || 
            vscode.workspace.getConfiguration('eyAgent').get<number>('maxTokens') || 
            1024;
        const temperature = options.temperature || 
            vscode.workspace.getConfiguration('eyAgent').get<number>('temperature') || 
            0.7;

        // Create API request based on the model
        const request: ApiRequest = {
            prompt,
            systemPrompt: options.systemPrompt,
            maxTokens,
            temperature,
            apiKey,
            endpoint,
            messages: options.messages
        };

        try {
            if (model.provider === 'OpenAI') {
                return await this.callOpenAI(request, model);
            } else if (model.provider === 'Anthropic') {
                return await this.callAnthropic(request, model);
            } else if (model.provider === 'Google') {
                return await this.callGoogle(request, model);
            } else if (model.provider === 'Custom') {
                return await this.callCustomModel(request, model);
            } else {
                return {
                    text: `Error: Unsupported model provider ${model.provider}`,
                    model: model.id,
                    error: `Unsupported model provider ${model.provider}`
                };
            }
        } catch (error) {
            console.error('Error calling AI model:', error);
            return {
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                model: model.id,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Call OpenAI API
     */
    private async callOpenAI(request: ApiRequest, model: AIModel): Promise<ApiResponse> {
        const messages = request.messages || [
            ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
            { role: 'user', content: request.prompt }
        ];

        const response = await fetch(request.endpoint || model.defaultEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${request.apiKey}`
            },
            body: JSON.stringify({
                model: model.id,
                messages,
                max_tokens: request.maxTokens,
                temperature: request.temperature
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as any;
        return {
            text: data.choices?.[0]?.message?.content?.trim() || '',
            model: model.id,
            usage: {
                promptTokens: data.usage?.prompt_tokens,
                completionTokens: data.usage?.completion_tokens,
                totalTokens: data.usage?.total_tokens
            }
        };
    }

    /**
     * Call Anthropic API
     */
    private async callAnthropic(request: ApiRequest, model: AIModel): Promise<ApiResponse> {
        const messages = request.messages || [
            { role: 'user', content: request.prompt }
        ];

        const response = await fetch(request.endpoint || model.defaultEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': request.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model.id,
                messages,
                system: request.systemPrompt,
                max_tokens: request.maxTokens
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as any;
        return {
            text: data.content?.[0]?.text || '',
            model: model.id,
            usage: {
                totalTokens: data.usage?.input_tokens + data.usage?.output_tokens,
                promptTokens: data.usage?.input_tokens,
                completionTokens: data.usage?.output_tokens
            }
        };
    }

    /**
     * Call Google Gemini API
     */
    private async callGoogle(request: ApiRequest, model: AIModel): Promise<ApiResponse> {
        const apiEndpoint = request.endpoint || model.defaultEndpoint;
        const apiUrl = `${apiEndpoint}?key=${request.apiKey}`;
        
        const messages = request.messages || [
            { role: 'user', content: request.prompt }
        ];

        // Convert to Google's format
        const contents = messages.map(msg => ({
            role: msg.role === 'system' ? 'user' : msg.role,
            parts: [{ text: msg.content }]
        }));

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    maxOutputTokens: request.maxTokens,
                    temperature: request.temperature
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as any;
        return {
            text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
            model: model.id,
            usage: {
                // Google doesn't provide detailed token usage in the same format
                totalTokens: data.usageMetadata?.totalTokenCount
            }
        };
    }

    /**
     * Call custom model API
     */
    private async callCustomModel(request: ApiRequest, model: AIModel): Promise<ApiResponse> {
        if (!request.endpoint) {
            throw new Error('No endpoint specified for custom model');
        }

        // This is a simple implementation that might need to be adjusted
        // depending on the custom API's requirements
        const response = await fetch(request.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${request.apiKey}`
            },
            body: JSON.stringify({
                prompt: request.prompt,
                max_tokens: request.maxTokens,
                temperature: request.temperature,
                // Add any other required fields for the custom API
                ...request.options
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Custom API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as any;
        
        // This assumes a response format similar to OpenAI
        // You may need to adjust this based on your custom API's response format
        return {
            text: data.choices?.[0]?.message?.content || data.text || data.completion || '',
            model: 'custom',
            usage: data.usage || {}
        };
    }
}
