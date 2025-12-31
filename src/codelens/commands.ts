import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PythonBridge, FunctionInfo } from '../services/pythonBridge';
import { TestRegistry } from '../services/testRegistry';
import { RoraCodeLensProvider } from './provider';

export function registerCommands(
    context: vscode.ExtensionContext,
    pythonBridge: PythonBridge,
    testRegistry: TestRegistry,
    codeLensProvider: RoraCodeLensProvider
): void {
    // Generate Test command
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'rora.generateTest',
            async (uri: vscode.Uri, func: FunctionInfo) => {
                await generateTest(uri, func, pythonBridge, testRegistry, codeLensProvider);
            }
        )
    );

    // Regenerate Test command
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'rora.regenerateTest',
            async (uri: vscode.Uri, func: FunctionInfo) => {
                await generateTest(uri, func, pythonBridge, testRegistry, codeLensProvider, true);
            }
        )
    );

    // View Test command
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'rora.viewTest',
            async (uri: vscode.Uri, func: FunctionInfo) => {
                const entry = testRegistry.getEntry(uri.fsPath, func.name);
                if (entry && fs.existsSync(entry.testFile)) {
                    const doc = await vscode.workspace.openTextDocument(entry.testFile);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                } else {
                    vscode.window.showWarningMessage(`No test found for ${func.name}`);
                }
            }
        )
    );

    // Run Test command
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'rora.runTest',
            async (uri: vscode.Uri, func: FunctionInfo) => {
                const entry = testRegistry.getEntry(uri.fsPath, func.name);
                
                // If no test exists, generate first
                if (!entry || !fs.existsSync(entry.testFile)) {
                    const generated = await generateTest(uri, func, pythonBridge, testRegistry, codeLensProvider);
                    if (!generated) {
                        return;
                    }
                }

                await runTest(uri, func, pythonBridge, testRegistry, codeLensProvider);
            }
        )
    );

    // Show Test Panel command
    context.subscriptions.push(
        vscode.commands.registerCommand('rora.showTestPanel', () => {
            // TODO: Implement test panel webview
            vscode.window.showInformationMessage('Test panel coming soon!');
        })
    );
}

async function generateTest(
    uri: vscode.Uri,
    func: FunctionInfo,
    pythonBridge: PythonBridge,
    testRegistry: TestRegistry,
    codeLensProvider: RoraCodeLensProvider,
    regenerate = false
): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('rora');
    const testDirectory = config.get<string>('testDirectory') || 'rora_tests';
    const framework = config.get<'pytest' | 'unittest'>('testFramework') || 'pytest';

    // Check for API key
    const apiKey = config.get<string>('geminiApiKey');
    if (!apiKey) {
        const action = await vscode.window.showErrorMessage(
            'Rora: Gemini API key not configured',
            'Configure Now'
        );
        if (action === 'Configure Now') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'rora.geminiApiKey');
        }
        return false;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Rora: No workspace folder found');
        return false;
    }

    // Show progress
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Rora: ${regenerate ? 'Regenerating' : 'Generating'} test for ${func.name}...`,
            cancellable: true
        },
        async (progress, token) => {
            try {
                // Read source code
                const document = await vscode.workspace.openTextDocument(uri);
                const sourceCode = document.getText();

                // Call agent to generate test
                const result = await pythonBridge.generateTests({
                    function_info: func,
                    source_code: sourceCode,
                    file_path: uri.fsPath,
                    project_root: workspaceFolder,
                    framework
                });

                if (token.isCancellationRequested) {
                    return false;
                }

                if (result.error) {
                    vscode.window.showErrorMessage(`Rora: ${result.error}`);
                    return false;
                }

                // Validate generated code
                const validation = await pythonBridge.validateSyntax(result.test_code);
                if (!validation.valid) {
                    vscode.window.showErrorMessage(
                        `Rora: Generated code has syntax error: ${validation.error}`
                    );
                    return false;
                }

                // Determine test file path
                const testFilePath = testRegistry.getTestFilePath(uri.fsPath, testDirectory);
                const testDir = path.dirname(testFilePath);

                // Create directory if needed
                if (!fs.existsSync(testDir)) {
                    fs.mkdirSync(testDir, { recursive: true });
                }

                // Write or update test file
                let existingContent = '';
                if (fs.existsSync(testFilePath)) {
                    existingContent = fs.readFileSync(testFilePath, 'utf8');
                }

                const newContent = mergeTestContent(
                    existingContent,
                    result.test_code,
                    result.imports,
                    func.name,
                    regenerate
                );

                fs.writeFileSync(testFilePath, newContent, 'utf8');

                // Register in test registry
                testRegistry.register({
                    sourceFile: uri.fsPath,
                    functionName: func.name,
                    testFile: testFilePath,
                    testFunctionName: result.test_function_name
                });

                // Refresh CodeLens
                codeLensProvider.refresh();

                vscode.window.showInformationMessage(
                    `Rora: Test ${regenerate ? 'regenerated' : 'generated'} for ${func.name}`
                );

                return true;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Rora: Failed to generate test - ${message}`);
                return false;
            }
        }
    );
}

async function runTest(
    uri: vscode.Uri,
    func: FunctionInfo,
    pythonBridge: PythonBridge,
    testRegistry: TestRegistry,
    codeLensProvider: RoraCodeLensProvider
): Promise<void> {
    const entry = testRegistry.getEntry(uri.fsPath, func.name);
    if (!entry) {
        vscode.window.showErrorMessage(`Rora: No test found for ${func.name}`);
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Rora: Running test for ${func.name}...`,
            cancellable: false
        },
        async () => {
            try {
                const result = await pythonBridge.runTests(
                    entry.testFile,
                    entry.testFunctionName
                );

                if (result.error) {
                    vscode.window.showErrorMessage(`Rora: ${result.error}`);
                    return;
                }

                // Find the outcome for our test
                const outcome = result.outcomes.find(
                    o => o.name.includes(entry.testFunctionName)
                );

                if (outcome) {
                    testRegistry.updateResult(
                        uri.fsPath,
                        func.name,
                        outcome.outcome
                    );

                    // Show result
                    const icon = outcome.outcome === 'passed' ? '✅' : '❌';
                    const message = `${icon} ${func.name}: ${outcome.outcome}`;
                    
                    if (outcome.outcome === 'passed') {
                        vscode.window.showInformationMessage(message);
                    } else {
                        const action = await vscode.window.showErrorMessage(
                            `${message}${outcome.message ? `: ${outcome.message}` : ''}`,
                            'View Details'
                        );
                        if (action === 'View Details') {
                            // Show output channel with details
                            const outputChannel = vscode.window.createOutputChannel('Rora Test Results');
                            outputChannel.clear();
                            outputChannel.appendLine(`Test: ${outcome.name}`);
                            outputChannel.appendLine(`Result: ${outcome.outcome}`);
                            if (outcome.message) {
                                outputChannel.appendLine(`Message: ${outcome.message}`);
                            }
                            if (outcome.traceback) {
                                outputChannel.appendLine('\nTraceback:');
                                outputChannel.appendLine(outcome.traceback);
                            }
                            outputChannel.show();
                        }
                    }
                }

                // Refresh CodeLens
                codeLensProvider.refresh();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Rora: Failed to run test - ${message}`);
            }
        }
    );
}

function mergeTestContent(
    existing: string,
    newCode: string,
    imports: string[],
    functionName: string,
    regenerate: boolean
): string {
    if (!existing) {
        // New file - add imports and test
        const importBlock = imports.join('\n');
        return `${importBlock}\n\n${newCode}\n`;
    }

    // File exists - need to merge
    let content = existing;

    // Add missing imports
    for (const imp of imports) {
        if (!content.includes(imp)) {
            // Find the last import line
            const lines = content.split('\n');
            let lastImportIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('import ') || lines[i].startsWith('from ')) {
                    lastImportIndex = i;
                }
            }
            if (lastImportIndex >= 0) {
                lines.splice(lastImportIndex + 1, 0, imp);
                content = lines.join('\n');
            } else {
                content = `${imp}\n${content}`;
            }
        }
    }

    // If regenerating, try to find and replace existing test
    if (regenerate) {
        // Look for existing test function for this function
        const testFuncPattern = new RegExp(
            `(def test_[^(]*${functionName}[^(]*\\([^)]*\\):.*?)(?=\\ndef |\\nclass |$)`,
            'gs'
        );
        if (testFuncPattern.test(content)) {
            content = content.replace(testFuncPattern, newCode);
            return content;
        }
    }

    // Append new test at the end
    content = content.trimEnd() + '\n\n' + newCode + '\n';
    return content;
}
