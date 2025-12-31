import * as vscode from 'vscode';
import { PythonBridge, FunctionInfo, ParseFileResult } from './pythonBridge';

interface CachedParse {
    functions: FunctionInfo[];
    version: number;  // Document version for precise invalidation
    timestamp: number;
}

/**
 * Service for parsing Python files and caching results.
 * Provides a layer on top of PythonBridge with intelligent caching.
 */
export class ParserService {
    private cache = new Map<string, CachedParse>();
    private pendingParses = new Map<string, Promise<ParseFileResult>>();
    private readonly CACHE_TTL = 30000; // 30 seconds fallback TTL
    private _onParsed = new vscode.EventEmitter<{ uri: vscode.Uri; functions: FunctionInfo[] }>();

    /** Fired when a file is parsed (useful for updating UI) */
    public readonly onParsed = this._onParsed.event;

    constructor(private pythonBridge: PythonBridge) {}

    /**
     * Parse a Python file and extract function information.
     * Results are cached by file path and document version.
     * 
     * @param document The document to parse
     * @param forceRefresh If true, bypass cache
     * @returns Array of function info, or empty array if parsing fails
     */
    async parseDocument(
        document: vscode.TextDocument,
        forceRefresh = false
    ): Promise<FunctionInfo[]> {
        if (document.languageId !== 'python') {
            return [];
        }

        const filePath = document.uri.fsPath;
        const version = document.version;

        // Check cache
        if (!forceRefresh) {
            const cached = this.cache.get(filePath);
            if (cached && cached.version === version) {
                return cached.functions;
            }
            // Also check if cache is still valid by TTL (for non-open documents)
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                return cached.functions;
            }
        }

        // Check if there's already a pending parse for this file
        const pendingKey = `${filePath}:${version}`;
        const pending = this.pendingParses.get(pendingKey);
        if (pending) {
            const result = await pending;
            return result.functions;
        }

        // Start new parse
        const parsePromise = this.pythonBridge.parseFile(filePath);
        this.pendingParses.set(pendingKey, parsePromise);

        try {
            const result = await parsePromise;

            if (result.error) {
                console.error('Parse error:', result.error);
                // Clear cache on error so next attempt tries again
                this.cache.delete(filePath);
                return [];
            }

            // Update cache
            this.cache.set(filePath, {
                functions: result.functions,
                version,
                timestamp: Date.now()
            });

            // Fire event
            this._onParsed.fire({ uri: document.uri, functions: result.functions });

            return result.functions;
        } finally {
            this.pendingParses.delete(pendingKey);
        }
    }

    /**
     * Parse a Python file by path (for files not currently open).
     * 
     * @param filePath Path to the Python file
     * @param forceRefresh If true, bypass cache
     * @returns Array of function info, or empty array if parsing fails
     */
    async parseFile(filePath: string, forceRefresh = false): Promise<FunctionInfo[]> {
        // Check cache (using TTL only since we don't have document version)
        if (!forceRefresh) {
            const cached = this.cache.get(filePath);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                return cached.functions;
            }
        }

        try {
            const result = await this.pythonBridge.parseFile(filePath);

            if (result.error) {
                console.error('Parse error:', result.error);
                return [];
            }

            // Update cache (version -1 indicates file-based parse)
            this.cache.set(filePath, {
                functions: result.functions,
                version: -1,
                timestamp: Date.now()
            });

            return result.functions;
        } catch (error) {
            console.error('Failed to parse file:', error);
            return [];
        }
    }

    /**
     * Get a specific function from a file.
     * 
     * @param filePath Path to the Python file
     * @param functionName Name of the function to find
     * @returns Function info or undefined if not found
     */
    async getFunction(filePath: string, functionName: string): Promise<FunctionInfo | undefined> {
        const functions = await this.parseFile(filePath);
        return functions.find(f => f.name === functionName);
    }

    /**
     * Get all functions from a file, optionally filtering by type.
     * 
     * @param filePath Path to the Python file
     * @param options Filter options
     */
    async getFunctions(
        filePath: string,
        options?: {
            includePrivate?: boolean;
            includeDunder?: boolean;
            includeNested?: boolean;
            methodsOnly?: boolean;
            topLevelOnly?: boolean;
        }
    ): Promise<FunctionInfo[]> {
        let functions = await this.parseFile(filePath);

        if (options) {
            functions = functions.filter(f => {
                // Filter private functions (single underscore prefix)
                if (!options.includePrivate && f.name.startsWith('_') && !f.name.startsWith('__')) {
                    return false;
                }
                // Filter dunder methods (double underscore)
                if (!options.includeDunder && f.name.startsWith('__') && f.name.endsWith('__')) {
                    return f.name === '__init__'; // Always include __init__
                }
                // Filter nested functions
                if (!options.includeNested && f.is_nested) {
                    return false;
                }
                // Filter to methods only
                if (options.methodsOnly && !f.is_method) {
                    return false;
                }
                // Filter to top-level only
                if (options.topLevelOnly && (f.is_method || f.is_nested)) {
                    return false;
                }
                return true;
            });
        }

        return functions;
    }

    /**
     * Invalidate the cache for a specific file.
     */
    invalidateCache(uri: vscode.Uri): void {
        this.cache.delete(uri.fsPath);
    }

    /**
     * Clear all cached data.
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics (for debugging/monitoring).
     */
    getCacheStats(): { size: number; files: string[] } {
        return {
            size: this.cache.size,
            files: Array.from(this.cache.keys())
        };
    }

    dispose(): void {
        this._onParsed.dispose();
        this.cache.clear();
    }
}
