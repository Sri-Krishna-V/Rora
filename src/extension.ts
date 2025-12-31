import * as vscode from 'vscode';
import { PythonBridge } from './services/pythonBridge';
import { ParserService } from './services/parserService';
import { RoraCodeLensProvider } from './codelens/provider';
import { TestRegistry } from './services/testRegistry';
import { ConfigService } from './services/configService';
import { registerCommands } from './codelens/commands';

let pythonBridge: PythonBridge | undefined;
let parserService: ParserService | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Rora extension is now active');
    console.log('Extension path:', context.extensionPath);

    // Initialize services
    const configService = new ConfigService();
    const testRegistry = new TestRegistry(context);
    
    // Initialize Python bridge - pass extension path for development
    pythonBridge = new PythonBridge(configService, context.extensionPath);
    
    let backendReady = false;
    try {
        await pythonBridge.start();
        console.log('Python backend started successfully');
        backendReady = true;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('Failed to start Python backend:', errorMsg);
        vscode.window.showWarningMessage(
            `Rora: Python backend not ready. CodeLens will appear but test generation requires the backend. Error: ${errorMsg}`
        );
    }

    // Initialize parser service (wraps Python bridge with caching)
    parserService = new ParserService(pythonBridge);
    context.subscriptions.push({ dispose: () => parserService?.dispose() });

    // Register CodeLens provider (even if backend isn't ready)
    const codeLensProvider = new RoraCodeLensProvider(pythonBridge, testRegistry, parserService);
    context.subscriptions.push({ dispose: () => codeLensProvider.dispose() });
    
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
        { language: 'python', scheme: 'file' },
        codeLensProvider
    );
    context.subscriptions.push(codeLensDisposable);

    // Register commands
    registerCommands(context, pythonBridge, testRegistry, codeLensProvider);

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('rora')) {
                configService.reload();
            }
        })
    );

    // Watch for file changes to invalidate cache
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.py');
    
    // On file change - invalidate cache and refresh CodeLens
    fileWatcher.onDidChange(uri => {
        parserService?.invalidateCache(uri);
        codeLensProvider.invalidateCache(uri);
    });
    
    // On file delete - invalidate cache and refresh CodeLens
    fileWatcher.onDidDelete(uri => {
        parserService?.invalidateCache(uri);
        codeLensProvider.invalidateCache(uri);
    });
    
    // On file create - refresh CodeLens (no cache to invalidate)
    fileWatcher.onDidCreate(uri => {
        codeLensProvider.refresh();
    });
    
    context.subscriptions.push(fileWatcher);

    // Watch for document changes (more responsive than file watcher for open documents)
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.languageId === 'python' && e.contentChanges.length > 0) {
                // Invalidate cache on edit (document version change will also help)
                parserService?.invalidateCache(e.document.uri);
                codeLensProvider.invalidateCache(e.document.uri);
            }
        })
    );

    // Watch for document save to trigger re-parse
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            if (document.languageId === 'python') {
                parserService?.invalidateCache(document.uri);
                codeLensProvider.invalidateCache(document.uri);
            }
        })
    );

    // Status bar item
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.text = '$(beaker) Rora';
    statusBarItem.tooltip = 'Rora AI Test Generator';
    statusBarItem.command = 'rora.showTestPanel';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
}

export function deactivate() {
    if (pythonBridge) {
        pythonBridge.stop();
    }
}
