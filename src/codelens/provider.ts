import * as vscode from 'vscode';
import { PythonBridge, FunctionInfo } from '../services/pythonBridge';
import { TestRegistry, FunctionState } from '../services/testRegistry';
import { ParserService } from '../services/parserService';

interface CachedParse {
    functions: FunctionInfo[];
    timestamp: number;
}

export class RoraCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    private cache = new Map<string, CachedParse>();
    private readonly CACHE_TTL = 5000; // 5 seconds
    private stateChangeSubscription: vscode.Disposable | undefined;

    constructor(
        private pythonBridge: PythonBridge,
        private testRegistry: TestRegistry,
        private parserService?: ParserService
    ) {
        // Listen for operation state changes to refresh CodeLens
        this.stateChangeSubscription = this.testRegistry.onStateChange(() => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    dispose(): void {
        this.stateChangeSubscription?.dispose();
        this._onDidChangeCodeLenses.dispose();
    }

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
            const operationState = this.testRegistry.getOperationState(document.uri.fsPath, func.name);

            // Show operation-in-progress state
            if (operationState === 'generating') {
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: '$(loading~spin) Generating...',
                        command: '',
                        tooltip: 'Test generation in progress'
                    })
                );
                continue;
            }

            if (operationState === 'running') {
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: '$(loading~spin) Running...',
                        command: '',
                        tooltip: 'Test execution in progress'
                    })
                );
                continue;
            }

            if (hasTest) {
                // Tests exist: Re-Generate | View | Run
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: '$(refresh) Re-Generate',
                        command: 'rora.regenerateTest',
                        arguments: [document.uri, func],
                        tooltip: 'Regenerate test for this function'
                    }),
                    new vscode.CodeLens(range, {
                        title: '$(file-code) View',
                        command: 'rora.viewTest',
                        arguments: [document.uri, func],
                        tooltip: 'View the generated test file'
                    }),
                    new vscode.CodeLens(range, {
                        title: this.getRunTitle(entry?.lastResult),
                        command: 'rora.runTest',
                        arguments: [document.uri, func],
                        tooltip: this.getRunTooltip(entry?.lastResult)
                    })
                );
            } else {
                // No tests: Generate | Run
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: '$(sparkle) Generate',
                        command: 'rora.generateTest',
                        arguments: [document.uri, func],
                        tooltip: 'Generate AI-powered test for this function'
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
                return '$(pass-filled) Run';
            case 'failed':
            case 'error':
                return '$(error) Run';
            case 'skipped':
                return '$(debug-step-over) Run';
            default:
                return '$(play) Run';
        }
    }

    private getRunTooltip(lastResult?: 'passed' | 'failed' | 'error' | 'skipped'): string {
        switch (lastResult) {
            case 'passed':
                return 'Last run: Passed ✓ - Click to run again';
            case 'failed':
                return 'Last run: Failed ✗ - Click to run again';
            case 'error':
                return 'Last run: Error - Click to run again';
            case 'skipped':
                return 'Last run: Skipped - Click to run again';
            default:
                return 'Run test';
        }
    }

    private async getFunctions(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<FunctionInfo[] | null> {
        const filePath = document.uri.fsPath;
        
        // Use ParserService if available (preferred)
        if (this.parserService) {
            try {
                const functions = await this.parserService.getFunctions(filePath, {
                    includePrivate: false,
                    includeDunder: false,
                    includeNested: false, // Don't show CodeLens for nested functions by default
                });
                
                if (token.isCancellationRequested) {
                    return null;
                }
                
                return functions;
            } catch (error) {
                console.error('ParserService error:', error);
                // Fall through to direct bridge call or regex fallback
            }
        }
        
        // Check local cache (fallback when ParserService isn't available)
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
        
        // Track class/function context for nested detection
        const contextStack: Array<{ indent: number; type: 'class' | 'function'; name: string }> = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const currentIndent = line.match(/^(\s*)/)?.[1].length || 0;
            
            // Pop context stack when we dedent
            while (contextStack.length > 0 && currentIndent <= contextStack[contextStack.length - 1].indent) {
                contextStack.pop();
            }
            
            // Check for class definitions
            const classMatch = line.match(/^(\s*)class\s+(\w+)/);
            if (classMatch) {
                contextStack.push({
                    indent: classMatch[1].length,
                    type: 'class',
                    name: classMatch[2]
                });
                continue;
            }
            
            const match = line.match(funcPattern);
            if (match) {
                const indent = match[1];
                const isAsync = !!match[2];
                const funcName = match[3];
                
                // Skip private/dunder methods for now (can be configured later)
                if (funcName.startsWith('__') && funcName.endsWith('__') && funcName !== '__init__') {
                    continue;
                }
                
                // Determine context
                const parentClass = contextStack.find(c => c.type === 'class')?.name || null;
                const parentFunction = contextStack.find(c => c.type === 'function')?.name || null;
                const isNested = parentFunction !== null;
                const isMethod = parentClass !== null && !isNested;
                
                // Skip nested functions (they get separate CodeLens only if enabled)
                if (isNested) {
                    // Add to context stack but don't add CodeLens
                    contextStack.push({
                        indent: indent.length,
                        type: 'function',
                        name: funcName
                    });
                    continue;
                }
                
                // Find the end of the function (simple heuristic: next line with same or less indent that has content)
                let endLine = i + 1;
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j];
                    if (nextLine.trim() === '') {
                        continue;
                    }
                    const lineIndent = nextLine.match(/^(\s*)/)?.[1] || '';
                    if (lineIndent.length <= indent.length && nextLine.trim() !== '') {
                        endLine = j;
                        break;
                    }
                    endLine = j + 1;
                }
                
                // Add function to context stack
                contextStack.push({
                    indent: indent.length,
                    type: 'function',
                    name: funcName
                });
                
                functions.push({
                    name: funcName,
                    lineno: i + 1,  // 1-indexed
                    end_lineno: endLine,
                    signature: `def ${funcName}(...)`,
                    docstring: null,
                    decorators: [],
                    is_async: isAsync,
                    is_method: isMethod,
                    is_nested: isNested,
                    class_name: parentClass,
                    parent_function: parentFunction
                });
            }
        }
        
        return functions;
    }
}
