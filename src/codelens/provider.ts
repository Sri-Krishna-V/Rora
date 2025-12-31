import * as vscode from 'vscode';
import { PythonBridge, FunctionInfo } from '../services/pythonBridge';
import { TestRegistry } from '../services/testRegistry';

interface CachedParse {
    functions: FunctionInfo[];
    timestamp: number;
}

export class RoraCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    private cache = new Map<string, CachedParse>();
    private readonly CACHE_TTL = 5000; // 5 seconds

    constructor(
        private pythonBridge: PythonBridge,
        private testRegistry: TestRegistry
    ) {}

    invalidateCache(uri: vscode.Uri): void {
        this.cache.delete(uri.fsPath);
        this._onDidChangeCodeLenses.fire();
    }

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        if (document.languageId !== 'python') {
            return [];
        }

        // Try to get functions from Python backend
        let functions = await this.getFunctions(document, token);
        
        // Fallback: use regex-based detection if Python backend fails
        if (!functions || functions.length === 0) {
            functions = this.getFunctionsFromRegex(document);
        }
        
        if (!functions || token.isCancellationRequested) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];

        for (const func of functions) {
            const range = new vscode.Range(
                func.lineno - 1, 0,
                func.lineno - 1, 0
            );

            const hasTest = this.testRegistry.hasTest(document.uri.fsPath, func.name);
            const entry = this.testRegistry.getEntry(document.uri.fsPath, func.name);

            if (hasTest) {
                // Tests exist: Re-Generate | View | Run
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: '$(refresh) Re-Generate',
                        command: 'rora.regenerateTest',
                        arguments: [document.uri, func]
                    }),
                    new vscode.CodeLens(range, {
                        title: '$(file-code) View',
                        command: 'rora.viewTest',
                        arguments: [document.uri, func]
                    }),
                    new vscode.CodeLens(range, {
                        title: this.getRunTitle(entry?.lastResult),
                        command: 'rora.runTest',
                        arguments: [document.uri, func]
                    })
                );
            } else {
                // No tests: Generate | Run
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: '$(sparkle) Generate',
                        command: 'rora.generateTest',
                        arguments: [document.uri, func]
                    }),
                    new vscode.CodeLens(range, {
                        title: '$(play) Run',
                        command: 'rora.runTest',
                        arguments: [document.uri, func],
                        tooltip: 'Generate and run test'
                    })
                );
            }
        }

        return codeLenses;
    }

    private getRunTitle(lastResult?: 'passed' | 'failed' | 'error' | 'skipped'): string {
        switch (lastResult) {
            case 'passed':
                return '$(check) Run';
            case 'failed':
            case 'error':
                return '$(x) Run';
            case 'skipped':
                return '$(debug-step-over) Run';
            default:
                return '$(play) Run';
        }
    }

    private async getFunctions(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<FunctionInfo[] | null> {
        const filePath = document.uri.fsPath;
        
        // Check cache
        const cached = this.cache.get(filePath);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.functions;
        }

        try {
            const result = await this.pythonBridge.parseFile(filePath);
            
            if (token.isCancellationRequested) {
                return null;
            }

            if (result.error) {
                console.error('Parse error:', result.error);
                return [];
            }

            // Update cache
            this.cache.set(filePath, {
                functions: result.functions,
                timestamp: Date.now()
            });

            return result.functions;
        } catch (error) {
            console.error('Failed to parse file:', error);
            return [];
        }
    }

    /**
     * Fallback function detection using regex when Python backend is unavailable.
     * Less accurate than AST parsing but allows CodeLens to appear.
     */
    private getFunctionsFromRegex(document: vscode.TextDocument): FunctionInfo[] {
        const functions: FunctionInfo[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        
        // Match function definitions: def func_name( or async def func_name(
        const funcPattern = /^(\s*)(async\s+)?def\s+(\w+)\s*\(/;
        
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(funcPattern);
            if (match) {
                const indent = match[1];
                const isAsync = !!match[2];
                const funcName = match[3];
                
                // Skip private/dunder methods for now (can be configured later)
                if (funcName.startsWith('__') && funcName.endsWith('__') && funcName !== '__init__') {
                    continue;
                }
                
                // Find the end of the function (simple heuristic: next line with same or less indent that has content)
                let endLine = i + 1;
                for (let j = i + 1; j < lines.length; j++) {
                    const line = lines[j];
                    if (line.trim() === '') {
                        continue;
                    }
                    const lineIndent = line.match(/^(\s*)/)?.[1] || '';
                    if (lineIndent.length <= indent.length && line.trim() !== '') {
                        endLine = j;
                        break;
                    }
                    endLine = j + 1;
                }
                
                functions.push({
                    name: funcName,
                    lineno: i + 1,  // 1-indexed
                    end_lineno: endLine,
                    signature: `def ${funcName}(...)`,
                    docstring: null,
                    decorators: [],
                    is_async: isAsync,
                    is_method: indent.length > 0,  // Rough heuristic
                    class_name: null
                });
            }
        }
        
        return functions;
    }
}
