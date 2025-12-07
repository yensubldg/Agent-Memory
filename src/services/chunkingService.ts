import * as vscode from 'vscode';
import * as path from 'path';

const Parser = require('web-tree-sitter');

const LANGUAGE_CONFIG: Record<string, string> = {
    'typescript': 'tree-sitter-typescript.wasm',
    'typescriptreact': 'tree-sitter-tsx.wasm',
    'python': 'tree-sitter-python.wasm',
    'c': 'tree-sitter-c.wasm',
    'cpp': 'tree-sitter-cpp.wasm',
    'bash': 'tree-sitter-bash.wasm'
};

export class ChunkingService {
    private parser: any;
    private context: vscode.ExtensionContext | undefined;
    private loadedLanguages: Map<string, any> = new Map();
    private currentLanguageId: string | undefined;

    async init(context: vscode.ExtensionContext) {
        try {
            this.context = context;
            await Parser.init();
            this.parser = new Parser();
            console.log('ChunkingService initialized with tree-sitter');
        } catch (error) {
            console.error('Failed to initialize ChunkingService:', error);
            // Don't throw - continue with simple chunking
            this.parser = null;
        }
    }

    /**
     * Loads a language WASM file and sets the parser to use it
     * @param languageId The VS Code language identifier (e.g., 'typescript', 'python')
     * @returns true if language was loaded successfully, false otherwise
     */
    async loadLanguage(languageId: string): Promise<boolean> {
        if (!this.context || !this.parser) {
            return false;
        }

        // Check if language is already loaded
        if (this.loadedLanguages.has(languageId)) {
            const language = this.loadedLanguages.get(languageId);
            this.parser.setLanguage(language);
            this.currentLanguageId = languageId;
            return true;
        }

        // Check if language is supported
        const wasmFile = LANGUAGE_CONFIG[languageId];
        if (!wasmFile) {
            return false;
        }

        try {
            const wasmPath = path.join(this.context.extensionPath, 'resources', wasmFile);
            const language = await Parser.Language.load(wasmPath);
            
            // Cache the loaded language
            this.loadedLanguages.set(languageId, language);
            
            // Set as current language
            this.parser.setLanguage(language);
            this.currentLanguageId = languageId;
            
            return true;
        } catch (error) {
            console.error(`Failed to load language '${languageId}':`, error);
            return false;
        }
    }

    /**
     * Gets the list of supported language IDs
     */
    getSupportedLanguages(): string[] {
        return Object.keys(LANGUAGE_CONFIG);
    }

    /**
     * Checks if a language is supported
     */
    isLanguageSupported(languageId: string): boolean {
        return languageId in LANGUAGE_CONFIG;
    }

    async chunk(code: string, languageId?: string, maxChunkSize: number = 500): Promise<string[]> {
        // Try to use tree-sitter if available
        if (this.parser && languageId) {
            const loaded = await this.loadLanguage(languageId);
            if (loaded) {
                try {
                    const tree = this.parser.parse(code);
                    const chunks: string[] = [];
                    this._visitNode(tree.rootNode, chunks, maxChunkSize);
                    if (chunks.length > 0) {
                        return chunks;
                    }
                } catch (error) {
                    console.error('Tree-sitter parsing failed:', error);
                }
            }
        }
        
        // Fallback to simple chunking
        return this._simpleChunk(code, maxChunkSize);
    }

    private _visitNode(node: any, chunks: string[], maxSize: number) {
        const isBlock = ['function_declaration', 'class_declaration', 'method_definition'].includes(node.type);
        const content = node.text;

        if (isBlock && content.length <= maxSize) {
            chunks.push(content);
            return;
        }

        if (node.childCount > 0) {
            for (const child of node.children) {
                this._visitNode(child, chunks, maxSize);
            }
        } else {
            if (content.trim().length > 0) {
                chunks.push(content);
            }
        }
    }

    private _simpleChunk(text: string, maxSize: number): string[] {
        const chunks: string[] = [];
        const lines = text.split('\n');
        let currentChunk = '';

        for (const line of lines) {
            if (currentChunk.length + line.length > maxSize && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = line + '\n';
            } else {
                currentChunk += line + '\n';
            }
        }

        if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk);
        }

        return chunks.length > 0 ? chunks : [text];
    }
}