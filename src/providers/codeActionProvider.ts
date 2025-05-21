import * as vscode from 'vscode';
import { ApiClient } from '../models/apiClient';

export class AICodeActionProvider implements vscode.CodeActionProvider {
  constructor(private apiClient: ApiClient) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    // Offer an "Explain Code" quick fix
    const explain = new vscode.CodeAction('Explain with eyAgent', vscode.CodeActionKind.QuickFix);
    explain.command = { command: 'eyAiAgent.explainCode', title: explain.title };

    // Offer a "Refactor Code" quick fix
    const refactor = new vscode.CodeAction('Refactor with eyAgent', vscode.CodeActionKind.QuickFix);
    refactor.command = { command: 'eyAiAgent.refactorCode', title: refactor.title };

    return [explain, refactor];
  }

  // Register only quickfix type
  public static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
  };
}
