import * as vscode from 'vscode';

export interface TelemetryData {
    completions: Record<string, number>;
    commands: Record<string, number>;
}

export class TelemetryManager {
    private readonly key = 'eyAgent.telemetry';

    constructor(private context: vscode.ExtensionContext) {}

    private get data(): TelemetryData {
        return this.context.globalState.get<TelemetryData>(this.key, { completions: {}, commands: {} });
    }

    private update(data: TelemetryData) {
        this.context.globalState.update(this.key, data);
    }

    recordCompletion(language: string) {
        const d = this.data;
        d.completions[language] = (d.completions[language] || 0) + 1;
        this.update(d);
    }

    recordCommand(cmd: string) {
        const d = this.data;
        d.commands[cmd] = (d.commands[cmd] || 0) + 1;
        this.update(d);
    }

    getMetrics(): TelemetryData {
        return this.data;
    }
}
