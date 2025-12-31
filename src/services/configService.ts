import * as vscode from 'vscode';

export class ConfigService {
    private config: vscode.WorkspaceConfiguration;

    constructor() {
        this.config = vscode.workspace.getConfiguration('rora');
    }

    reload(): void {
        this.config = vscode.workspace.getConfiguration('rora');
    }

    get<T>(key: string): T | undefined {
        return this.config.get<T>(key);
    }

    get testFramework(): 'pytest' | 'unittest' {
        return this.config.get<'pytest' | 'unittest'>('testFramework') || 'pytest';
    }

    get geminiApiKey(): string {
        return this.config.get<string>('geminiApiKey') || '';
    }

    get testDirectory(): string {
        return this.config.get<string>('testDirectory') || 'rora_tests';
    }

    get pythonPath(): string | undefined {
        return this.config.get<string>('pythonPath') || undefined;
    }

    async setGeminiApiKey(apiKey: string): Promise<void> {
        await this.config.update('geminiApiKey', apiKey, vscode.ConfigurationTarget.Global);
    }

    hasApiKey(): boolean {
        return !!this.geminiApiKey;
    }
}
