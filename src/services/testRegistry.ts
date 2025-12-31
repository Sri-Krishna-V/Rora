import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface TestEntry {
    sourceFile: string;
    functionName: string;
    testFile: string;
    testFunctionName: string;
    lastGenerated: number;
    lastRun?: number;
    lastResult?: 'passed' | 'failed' | 'error' | 'skipped';
}

export interface TestRegistryData {
    version: number;
    entries: Record<string, TestEntry>;  // key: sourceFile:functionName
}

export class TestRegistry {
    private data: TestRegistryData;
    private context: vscode.ExtensionContext;
    private saveDebounce: NodeJS.Timeout | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.data = this.load();
    }

    private getStorageKey(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return `rora.testRegistry.${workspaceFolder || 'global'}`;
    }

    private load(): TestRegistryData {
        const stored = this.context.globalState.get<TestRegistryData>(this.getStorageKey());
        if (stored && stored.version === 1) {
            return stored;
        }
        return { version: 1, entries: {} };
    }

    private save(): void {
        // Debounce saves
        if (this.saveDebounce) {
            clearTimeout(this.saveDebounce);
        }
        this.saveDebounce = setTimeout(() => {
            this.context.globalState.update(this.getStorageKey(), this.data);
        }, 500);
    }

    private makeKey(sourceFile: string, functionName: string): string {
        return `${sourceFile}:${functionName}`;
    }

    register(entry: Omit<TestEntry, 'lastGenerated'>): void {
        const key = this.makeKey(entry.sourceFile, entry.functionName);
        this.data.entries[key] = {
            ...entry,
            lastGenerated: Date.now()
        };
        this.save();
    }

    getEntry(sourceFile: string, functionName: string): TestEntry | undefined {
        const key = this.makeKey(sourceFile, functionName);
        return this.data.entries[key];
    }

    hasTest(sourceFile: string, functionName: string): boolean {
        const entry = this.getEntry(sourceFile, functionName);
        if (!entry) {
            return false;
        }
        // Verify the test file still exists
        return fs.existsSync(entry.testFile);
    }

    updateResult(sourceFile: string, functionName: string, result: 'passed' | 'failed' | 'error' | 'skipped'): void {
        const key = this.makeKey(sourceFile, functionName);
        const entry = this.data.entries[key];
        if (entry) {
            entry.lastRun = Date.now();
            entry.lastResult = result;
            this.save();
        }
    }

    getEntriesForFile(sourceFile: string): TestEntry[] {
        return Object.values(this.data.entries).filter(
            entry => entry.sourceFile === sourceFile
        );
    }

    getAllEntries(): TestEntry[] {
        return Object.values(this.data.entries);
    }

    remove(sourceFile: string, functionName: string): void {
        const key = this.makeKey(sourceFile, functionName);
        delete this.data.entries[key];
        this.save();
    }

    getTestFilePath(sourceFile: string, testDirectory: string): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        const relativePath = path.relative(workspaceFolder, sourceFile);
        const sourceFileName = path.basename(sourceFile, '.py');
        const sourceDir = path.dirname(relativePath);
        
        // rora_tests/path/to/test_filename.py
        return path.join(
            workspaceFolder,
            testDirectory,
            sourceDir,
            `test_${sourceFileName}.py`
        );
    }
}
