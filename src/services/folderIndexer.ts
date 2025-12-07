import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface IndexingOptions {
    maxFileSize: number; // in bytes
    excludePatterns: string[];
    includeExtensions: string[];
    maxFiles: number;
}

export interface IndexingResult {
    totalFiles: number;
    indexedFiles: number;
    skippedFiles: number;
    failedFiles: number;
    totalChunks: number;
    errors: Array<{ file: string; error: string }>;
}

export class FolderIndexer {
    private static readonly DEFAULT_OPTIONS: IndexingOptions = {
        maxFileSize: 1 * 1024 * 1024, // 1MB
        excludePatterns: [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/.git/**',
            '**/.vscode/**',
            '**/coverage/**',
            '**/*.min.js',
            '**/*.bundle.js',
            '**/*.map'
        ],
        includeExtensions: [
            '.ts', '.tsx', '.js', '.jsx',
            '.py', '.java', '.c', '.cpp', '.h',
            '.go', '.rs', '.rb', '.php',
            '.cs', '.swift', '.kt'
        ],
        maxFiles: 500
    };

    static async getFilesToIndex(
        folderPath: string,
        options: Partial<IndexingOptions> = {}
    ): Promise<string[]> {
        // Read from VS Code settings
        const config = vscode.workspace.getConfiguration('agentMemory.indexing');
        const userOptions: Partial<IndexingOptions> = {
            maxFileSize: config.get('maxFileSize'),
            maxFiles: config.get('maxFiles'),
            excludePatterns: config.get('excludePatterns'),
            includeExtensions: config.get('includeExtensions')
        };
        
        const opts = { ...this.DEFAULT_OPTIONS, ...userOptions, ...options };
        const files: string[] = [];

        const excludeGlobs = opts.excludePatterns.map(pattern => 
            new vscode.RelativePattern(folderPath, pattern)
        );

        // Get all files matching included extensions
        for (const ext of opts.includeExtensions) {
            const pattern = new vscode.RelativePattern(folderPath, `**/*${ext}`);
            const foundFiles = await vscode.workspace.findFiles(pattern);
            
            for (const uri of foundFiles) {
                const filePath = uri.fsPath;
                
                // Check if file should be excluded
                const shouldExclude = excludeGlobs.some(glob => {
                    const globPattern = glob.pattern.toString();
                    return this.matchesPattern(filePath, folderPath, globPattern);
                });

                if (shouldExclude) {
                    continue;
                }

                // Check file size
                try {
                    const stat = await fs.promises.stat(filePath);
                    if (stat.size > opts.maxFileSize) {
                        continue;
                    }
                } catch {
                    continue;
                }

                files.push(filePath);

                // Stop if max files reached
                if (files.length >= opts.maxFiles) {
                    break;
                }
            }

            if (files.length >= opts.maxFiles) {
                break;
            }
        }

        return files;
    }

    private static matchesPattern(filePath: string, basePath: string, pattern: string): boolean {
        const relativePath = path.relative(basePath, filePath);
        const normalizedPattern = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
        const regex = new RegExp(normalizedPattern);
        return regex.test(relativePath);
    }

    static async validateIndexingOperation(
        folderPath: string,
        options: Partial<IndexingOptions> = {}
    ): Promise<{ valid: boolean; message: string; fileCount: number }> {
        const files = await this.getFilesToIndex(folderPath, options);
        const opts = { ...this.DEFAULT_OPTIONS, ...options };

        if (files.length === 0) {
            return {
                valid: false,
                message: 'No files found to index in this folder.',
                fileCount: 0
            };
        }

        if (files.length > opts.maxFiles) {
            return {
                valid: false,
                message: `Too many files (${files.length}). Maximum is ${opts.maxFiles}. Consider using exclude patterns.`,
                fileCount: files.length
            };
        }

        // Estimate total size
        let totalSize = 0;
        for (const file of files.slice(0, 100)) { // Sample first 100 files
            try {
                const stat = await fs.promises.stat(file);
                totalSize += stat.size;
            } catch {
                // ignore
            }
        }

        const estimatedTotalSize = (totalSize / Math.min(files.length, 100)) * files.length;
        const estimatedMB = (estimatedTotalSize / (1024 * 1024)).toFixed(1);

        return {
            valid: true,
            message: `Ready to index ${files.length} files (~${estimatedMB} MB). This may take a few minutes.`,
            fileCount: files.length
        };
    }
}
