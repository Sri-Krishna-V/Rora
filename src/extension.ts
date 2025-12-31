import * as vscode from 'vscode';
import { PythonBridge } from './services/pythonBridge';
import { RoraCodeLensProvider } from './codelens/provider';
import { TestRegistry } from './services/testRegistry';
import { ConfigService } from './services/configService';
import { registerCommands } from './codelens/commands';

let pythonBridge: PythonBridge | undefined;

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

    // Register CodeLens provider (even if backend isn't ready)
    const codeLensProvider = new RoraCodeLensProvider(pythonBridge, testRegistry);
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
    fileWatcher.onDidChange(uri => {
        codeLensProvider.invalidateCache(uri);
    });
    fileWatcher.onDidDelete(uri => {
        codeLensProvider.invalidateCache(uri);
    });
    context.subscriptions.push(fileWatcher);

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
