import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { ConfigService } from './configService';
import {
    createMessageConnection,
    MessageConnection,
    StreamMessageReader,
    StreamMessageWriter,
    RequestType
} from 'vscode-jsonrpc/node';

// JSON-RPC request types
export interface FunctionInfo {
    name: string;
    lineno: number;
    end_lineno: number;
    signature: string;
    docstring: string | null;
    decorators: string[];
    is_async: boolean;
    is_method: boolean;
    is_nested: boolean;
    class_name: string | null;
    parent_function: string | null;
}

export interface ParseFileResult {
    functions: FunctionInfo[];
    error?: string;
}

export interface GenerateTestParams {
    function_info: FunctionInfo;
    source_code: string;
    file_path: string;
    project_root: string;
    framework: 'pytest' | 'unittest';
}

export interface GenerateTestResult {
    test_code: string;
    test_function_name: string;
    imports: string[];
    error?: string;
}

export interface RunTestParams {
    test_path: string;
    test_function?: string;
}

export interface TestOutcome {
    name: string;
    outcome: 'passed' | 'failed' | 'skipped' | 'error';
    duration: number;
    message?: string;
    traceback?: string;
}

export interface RunTestResult {
    outcomes: TestOutcome[];
    total: number;
    passed: number;
    failed: number;
    error?: string;
}

export interface ValidateSyntaxResult {
    valid: boolean;
    error?: string;
    line?: number;
}

// Request type definitions for JSON-RPC
const ParseFileRequest = new RequestType<{ file_path: string }, ParseFileResult, void>('parse_file');
const GenerateTestsRequest = new RequestType<GenerateTestParams, GenerateTestResult, void>('generate_tests');
const RunTestsRequest = new RequestType<RunTestParams, RunTestResult, void>('run_tests');
const ValidateSyntaxRequest = new RequestType<{ code: string }, ValidateSyntaxResult, void>('validate_syntax');

export class PythonBridge {
    private process: ChildProcess | null = null;
    private connection: MessageConnection | null = null;
    private configService: ConfigService;
    private extensionPath: string;
    private startPromise: Promise<void> | null = null;

    constructor(configService: ConfigService, extensionPath: string) {
        this.configService = configService;
        this.extensionPath = extensionPath;
    }

    async start(): Promise<void> {
        if (this.startPromise) {
            return this.startPromise;
        }

        this.startPromise = this._start();
        return this.startPromise;
    }

    private async _start(): Promise<void> {
        const pythonPath = await this.getPythonPath();
        const agentPath = this.getAgentPath();

        console.log(`Starting Python backend: ${pythonPath} -m rora_agent.server`);

        this.process = spawn(pythonPath, ['-m', 'rora_agent.server'], {
            cwd: agentPath,
            env: {
                ...process.env,
                PYTHONUNBUFFERED: '1'
            },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        if (!this.process.stdout || !this.process.stdin) {
            throw new Error('Failed to create Python process streams');
        }

        // Set up JSON-RPC connection
        this.connection = createMessageConnection(
            new StreamMessageReader(this.process.stdout),
            new StreamMessageWriter(this.process.stdin)
        );

        this.connection.onError((error) => {
            console.error('JSON-RPC error:', error);
        });

        this.connection.onClose(() => {
            console.log('JSON-RPC connection closed');
        });

        this.process.stderr?.on('data', (data) => {
            console.error('Python stderr:', data.toString());
        });

        this.process.on('exit', (code) => {
            console.log(`Python process exited with code ${code}`);
            this.connection = null;
            this.process = null;
            this.startPromise = null;
        });

        this.connection.listen();

        // Wait a bit for the server to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    private async getPythonPath(): Promise<string> {
        // Check configuration first
        const configuredPath = this.configService.get<string>('pythonPath');
        if (configuredPath) {
            return configuredPath;
        }

        const fs = require('fs');
        
        // Check for venv in extension's rora_agent folder (development mode)
        const venvPython = process.platform === 'win32'
            ? path.join(this.extensionPath, 'rora_agent', '.venv', 'Scripts', 'python.exe')
            : path.join(this.extensionPath, 'rora_agent', '.venv', 'bin', 'python');
        
        if (fs.existsSync(venvPython)) {
            console.log(`Using venv Python: ${venvPython}`);
            return venvPython;
        }

        // Try to get from Python extension
        const pythonExtension = vscode.extensions.getExtension('ms-python.python');
        if (pythonExtension) {
            if (!pythonExtension.isActive) {
                await pythonExtension.activate();
            }
            const pythonApi = pythonExtension.exports;
            if (pythonApi?.environments?.getActiveEnvironmentPath) {
                const envPath = await pythonApi.environments.getActiveEnvironmentPath();
                if (envPath?.path) {
                    return envPath.path;
                }
            }
        }

        // Fallback to system Python
        return process.platform === 'win32' ? 'python' : 'python3';
    }

    private getAgentPath(): string {
        // Always use extension path first (works for both dev and production)
        const agentInExtension = path.join(this.extensionPath, 'rora_agent');
        if (require('fs').existsSync(agentInExtension)) {
            console.log('Using agent from extension path:', agentInExtension);
            return agentInExtension;
        }

        // Fallback: check workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceFolder) {
            const agentInWorkspace = path.join(workspaceFolder, 'rora_agent');
            if (require('fs').existsSync(agentInWorkspace)) {
                console.log('Using agent from workspace:', agentInWorkspace);
                return agentInWorkspace;
            }
        }

        throw new Error('Could not find rora_agent directory. Expected at: ' + agentInExtension);
    }

    async parseFile(filePath: string): Promise<ParseFileResult> {
        await this.ensureConnection();
        return this.connection!.sendRequest(ParseFileRequest, { file_path: filePath });
    }

    async generateTests(params: GenerateTestParams): Promise<GenerateTestResult> {
        await this.ensureConnection();
        return this.connection!.sendRequest(GenerateTestsRequest, params);
    }

    async runTests(testPath: string, testFunction?: string): Promise<RunTestResult> {
        await this.ensureConnection();
        return this.connection!.sendRequest(RunTestsRequest, { 
            test_path: testPath,
            test_function: testFunction 
        });
    }

    async validateSyntax(code: string): Promise<ValidateSyntaxResult> {
        await this.ensureConnection();
        return this.connection!.sendRequest(ValidateSyntaxRequest, { code });
    }

    private async ensureConnection(): Promise<void> {
        if (!this.connection || !this.process) {
            await this.start();
        }
    }

    stop(): void {
        if (this.connection) {
            this.connection.dispose();
            this.connection = null;
        }
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        this.startPromise = null;
    }
}
