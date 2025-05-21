// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Interface for AI model providers
 */
export interface AIModel {
    name: string;
    id: string;
    provider: string;
    maxTokens: number;
    description: string;
    secretKeyName: string;
    defaultEndpoint: string;
}

/**
 * Request message for API calls
 */
export interface ApiRequest {
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    apiKey: string;
    endpoint?: string;
    messages?: Array<{role: string, content: string}>;
    options?: Record<string, any>;
}

/**
 * Response from API calls
 */
export interface ApiResponse {
    text: string;
    model: string;
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
    error?: string;
}

/**
 * Supported AI models
 */
export const SUPPORTED_MODELS: AIModel[] = [
    {
        name: 'GPT-4',
        id: 'gpt-4',
        provider: 'OpenAI',
        maxTokens: 4000,
        description: 'OpenAI GPT-4 - Advanced reasoning capabilities',
        secretKeyName: 'openaiApiKey',
        defaultEndpoint: 'https://api.openai.com/v1/chat/completions'
    },
    {
        name: 'GPT-3.5 Turbo',
        id: 'gpt-3.5-turbo',
        provider: 'OpenAI',
        maxTokens: 4000,
        description: 'OpenAI GPT-3.5 Turbo - Fast and cost-effective',
        secretKeyName: 'openaiApiKey',
        defaultEndpoint: 'https://api.openai.com/v1/chat/completions'
    },
    {
        name: 'Claude 3 Opus',
        id: 'claude-3-opus',
        provider: 'Anthropic',
        maxTokens: 4000,
        description: 'Anthropic Claude 3 Opus - Most capable Claude model',
        secretKeyName: 'anthropicApiKey',
        defaultEndpoint: 'https://api.anthropic.com/v1/messages'
    },
    {
        name: 'Claude 3 Sonnet',
        id: 'claude-3-sonnet',
        provider: 'Anthropic',
        maxTokens: 4000,
        description: 'Anthropic Claude 3 Sonnet - Balanced performance',
        secretKeyName: 'anthropicApiKey',
        defaultEndpoint: 'https://api.anthropic.com/v1/messages'
    },
    {
        name: 'Gemini Pro',
        id: 'gemini-pro',
        provider: 'Google',
        maxTokens: 4000,
        description: 'Google Gemini Pro - Google\'s advanced AI model',
        secretKeyName: 'googleApiKey',
        defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent'
    },
    {
        name: 'Gemini 1.5 Pro',
        id: 'gemini-1.5-pro',
        provider: 'Google',
        maxTokens: 8000,
        description: 'Google Gemini 1.5 Pro - Latest Google AI model',
        secretKeyName: 'googleApiKey',
        defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent'
    },
    {
        name: 'Custom Model',
        id: 'custom',
        provider: 'Custom',
        maxTokens: 4000,
        description: 'Custom API endpoint for other models',
        secretKeyName: 'customApiKey',
        defaultEndpoint: ''
    }
];

/**
 * Get model by ID
 */
export function getModelById(id: string): AIModel | undefined {
    return SUPPORTED_MODELS.find(model => model.id === id);
}
