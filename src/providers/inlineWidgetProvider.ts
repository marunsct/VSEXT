import * as vscode from 'vscode';

// Simple CodeLens provider to show inline suggestion controls at cursor
export class InlineWidgetProvider implements vscode.CodeLensProvider {
  constructor(private inlineProvider: vscode.InlineCompletionItemProvider) {}

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      return [];
    }
    const pos = editor.selection.active;
    const range = new vscode.Range(pos.line, 0, pos.line, 0);
    // Show three lenses: Prev, Accept, Next
    return [
      new vscode.CodeLens(range, { title: '← Prev', command: 'eyAiAgent.prevInlineSuggestion' }),
      new vscode.CodeLens(range, { title: '⏎ Accept', command: 'eyAiAgent.acceptInlineSuggestion' }),
      new vscode.CodeLens(range, { title: 'Next →', command: 'eyAiAgent.nextInlineSuggestion' })
    ];
  }
}
