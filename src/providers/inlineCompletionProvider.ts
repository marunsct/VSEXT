// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ApiClient } from '../models/apiClient';

/**
 * Provider for inline code completions (ghost text)
 */
export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    private enabled: boolean;
    private debounceTimeout: NodeJS.Timeout | undefined;
    private lastCompletionTime: number = 0;
    private pendingCompletions: Map<string, Promise<vscode.InlineCompletionList>> = new Map();
    private completionCache: Map<string, {expiresAt: number, items: vscode.InlineCompletionList}> = new Map();
    
    // Language-specific context gathering settings
    private languageConfig: Record<string, {
        contextLines: number;
        fileImportance: number; // 0-10 importance of including imports/declarations
        importantSections: RegExp[]; // Regex patterns for code sections considered important for context
    }> = {
        typescript: {
            contextLines: 50,
            fileImportance: 7,
            importantSections: [/interface\s+\w+/, /class\s+\w+/, /function\s+\w+/, /type\s+\w+/]
        },
        javascript: {
            contextLines: 50,
            fileImportance: 7,
            importantSections: [/class\s+\w+/, /function\s+\w+/, /const\s+\w+\s*=\s*function/, /export\s+/]
        },
        python: {
            contextLines: 40,
            fileImportance: 8,
            importantSections: [/def\s+\w+/, /class\s+\w+/, /import\s+/, /from\s+.+\s+import/]
        },
        java: {
            contextLines: 60,
            fileImportance: 5,
            importantSections: [/class\s+\w+/, /interface\s+\w+/, /public\s+\w+/, /private\s+\w+/]
        },
        // Default configuration
        default: {
            contextLines: 30,
            fileImportance: 5,
            importantSections: []
        }
    };

    /**
     * Creates a new inline completion provider
     * @param apiClient API client
     */
    constructor(private apiClient: ApiClient) {
        this.enabled = vscode.workspace.getConfiguration('eyAgent').get<boolean>('inlineCompletions.enabled') ?? true;
        
        // Initialize settings when extension is loaded
        this.loadConfiguration();
        
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('eyAgent')) {
                this.loadConfiguration();
            }
        });
    }
    
    /**
     * Load configuration from settings
     */
    private loadConfiguration(): void {
        this.enabled = vscode.workspace.getConfiguration('eyAgent').get<boolean>('inlineCompletions.enabled') ?? true;
        
        // Load any custom language configurations from settings
        const customLanguageSettings = vscode.workspace.getConfiguration('eyAgent').get<any>('inlineCompletions.languageSettings');
        if (customLanguageSettings) {
            // Merge with default settings
            Object.keys(customLanguageSettings).forEach(lang => {
                this.languageConfig[lang] = {
                    ...this.languageConfig.default,
                    ...customLanguageSettings[lang]
                };
            });
        }
    }

    /**
     * Enable or disable inline completions
     * @param enabled Whether inline completions should be enabled
     */
    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        vscode.workspace.getConfiguration('eyAgent').update('inlineCompletions.enabled', enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * Check if inline completions are enabled
     */
    public isEnabled(): boolean {
        return this.enabled;
    }    /**
     * Provide inline completion items with caching, debouncing, and enhanced context
     */
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList> {
        if (!this.enabled) {
            return { items: [] };
        }
        // Skip contexts where completions should not trigger
        if (this.shouldSkipCompletion(document, position, context)) {
            return { items: [] };
        }

        // Generate a cache key based on document and position
        const key = `${document.uri.toString()}|${position.line}:${position.character}`;
        // Return cached result if still valid
        const cached = this.completionCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.items;
        }
        // If there's already a pending call, return its promise
        if (this.pendingCompletions.has(key)) {
            return this.pendingCompletions.get(key)!;
        }

        const delay = vscode.workspace.getConfiguration('eyAgent').get<number>('completionDelay', 300);
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }

        // Wrap the API call in a promise and store it to dedupe
        const promise = new Promise<vscode.InlineCompletionList>(resolve => {
            this.debounceTimeout = setTimeout(async () => {
                try {
                    const now = Date.now();
                    // Rate limit to one per second
                    if (now - this.lastCompletionTime < 1000) {
                        resolve({ items: [] });
                        this.pendingCompletions.delete(key);
                        return;
                    }
                    this.lastCompletionTime = now;

                    const model = vscode.workspace.getConfiguration('eyAgent').get<string>('defaultModel', 'gpt-4');
                    const language = document.languageId;
                    const ctx = this.getSmartCompletionContext(document, position, language);
                    // Skip if too little context
                    if (ctx.currentLine.length < 10 && ctx.prefixCode.length < 20) {
                        resolve({ items: [] });
                        this.pendingCompletions.delete(key);
                        return;
                    }
                    if (token.isCancellationRequested) {
                        resolve({ items: [] });
                        this.pendingCompletions.delete(key);
                        return;
                    }
                    // Build system prompt
                    const systemPrompt = `You are an AI programming assistant for ${language}. Continue the code after the cursor, closing brackets and respecting indentation. Return only the code completion.`;
                    const response = await this.apiClient.callModel(model, ctx.completePrompt, { systemPrompt, maxTokens: 150, temperature: 0.3 });
                    if (response.error || !response.text) {
                        resolve({ items: [] });
                        this.pendingCompletions.delete(key);
                        return;
                    }
                    let text = response.text.trim();
                    text = this.postProcessCompletion(text, language, ctx.currentLine);
                    const list = { items: [ new vscode.InlineCompletionItem(text, new vscode.Range(position, position)) ] };
                    // Cache for 30 seconds
                    this.completionCache.set(key, { expiresAt: Date.now() + 30000, items: list });
                    resolve(list);
                } catch (e) {
                    console.error('Inline completion error:', e);
                    resolve({ items: [] });
                } finally {
                    this.pendingCompletions.delete(key);
                }
            }, delay);
        });
        this.pendingCompletions.set(key, promise);
        return promise;
    }

    /**
     * Post-process the completion to strip formatting and apply indentation
     */
    private postProcessCompletion(text: string, language: string, currentLine: string): string {
        // Remove Markdown code fences or language prefixes
        text = text.replace(/```[\s\S]*?```/g, '').trim();
        // Align indentation for multi-line completions
        const indent = currentLine.match(/^(\s*)/)?.[1] || '';
        if (text.includes('\n')) {
            const lines = text.split('\n');
            text = lines.map((ln, i) => i === 0 ? ln : indent + ln).join('\n');
        }
        // Strip duplicated braces/brackets
        if (/[{\[(]$/.test(currentLine.trim()) && /^[{\[(]/.test(text.trim())) {
            text = text.trim().substring(1);
        }
        return text;
    }

    /**
     * Determine if inline suggestions should be skipped in this context
     */
    private shouldSkipCompletion(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext): boolean {
        // Do not trigger while user is typing fast or within comments/strings
        if (context.selectedCompletionInfo) { return true; }
        const lineText = document.lineAt(position.line).text;
        if (!lineText.trim()) { return true; }
        if (this.isInComment(document, position) || this.isInString(document, position)) { return true; }
        return false;
    }

    /**
     * Build smart context around the cursor for completion
     */
    private getSmartCompletionContext(document: vscode.TextDocument, position: vscode.Position, language: string) {
        const cfg = this.languageConfig[language] || this.languageConfig.default;
        const start = Math.max(0, position.line - cfg.contextLines);
        const lines = [];
        for (let i = start; i <= position.line; i++) {
            const txt = document.lineAt(i).text;
            lines.push(i === position.line ? txt.slice(0, position.character) : txt);
        }
        const prefix = lines.join('\n');
        // Include imports or declarations if important
        let imports = '';
        if (cfg.fileImportance > 3) {
            imports = this.getImportantDeclarations(document, position, cfg.importantSections);
            if (imports) { imports += '\n'; }
        }
        const hint = this.getLanguageHint(language, document.fileName.split('.').pop());
        return { prefixCode: prefix, currentLine: lines[lines.length-1], completePrompt: `${hint}\n${imports}${prefix}` };
    }

    /**
     * Generate a language hint for the AI prompt
     */
    private getLanguageHint(language: string, ext?: string): string {
        const fileType = ext ? ` (${ext} file)` : '';
        return `// Language: ${language}${fileType}`;
    }

    /**
     * Extract important declarations like imports or interfaces
     */
    private getImportantDeclarations(document: vscode.TextDocument, position: vscode.Position, patterns: RegExp[]): string {
        const max = Math.min(document.lineCount, 200);
        let decl = '';
        for (let i = 0; i < max; i++) {
            const line = document.lineAt(i).text;
            if (patterns.some(p => p.test(line))) {
                decl += line + '\n';
            }
        }
        return decl;
    }

    /**
     * Check if cursor is inside a comment block or line comment
     */
    private isInComment(document: vscode.TextDocument, position: vscode.Position): boolean {
        const txt = document.getText(new vscode.Range(new vscode.Position(0,0), position));
        // Rough heuristic: count /* vs */ occurrences
        const opens = (txt.match(/\/\*/g) || []).length;
        const closes = (txt.match(/\*\//g) || []).length;
        return opens > closes;
    }

    /**
     * Check if cursor is inside a string literal
     */
    private isInString(document: vscode.TextDocument, position: vscode.Position): boolean {
        const line = document.lineAt(position.line).text.slice(0, position.character);
        let sq = 0, dq = 0, bt = 0;
        for (const ch of line) {
            if (ch === `'`) { sq++; }
            if (ch === `"`) { dq++; }
            if (ch === '`') {bt++; }
        }
        return (sq % 2 === 1) || (dq % 2 === 1) || (bt % 2 === 1);
    }
}
