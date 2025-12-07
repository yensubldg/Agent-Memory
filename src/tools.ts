import * as vscode from "vscode";
import * as path from "path";
import { MemoryService } from "./services/memoryService";

// ============================================================================
// SEARCH MEMORY TOOL
// ============================================================================

export interface ISearchMemoryParameters {
    query: string;
    limit?: number;
}

export class SearchMemoryTool
    implements vscode.LanguageModelTool<ISearchMemoryParameters> {
    constructor(private memoryService: MemoryService) { }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<ISearchMemoryParameters>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { query, limit = 5 } = options.input;

        try {
            const searchResults = await this.memoryService.search(query, limit);

            if (searchResults.length === 0) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        "No relevant code found in memory database. Consider indexing files first using the index_file or index_folder tools."
                    ),
                ]);
            }

            let resultText = `Found ${searchResults.length} relevant code snippets:\n\n`;
            searchResults.forEach((doc: any, index: number) => {
                resultText += `--- Result ${index + 1}: ${doc.filepath} ---\n${doc.text}\n\n`;
            });

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(resultText),
            ]);
        } catch (error) {
            throw new Error(
                `Failed to search memory: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<ISearchMemoryParameters>,
        _token: vscode.CancellationToken
    ): Promise<vscode.PreparedToolInvocation> {
        const { query, limit = 5 } = options.input;

        return {
            invocationMessage: `Searching memory for: "${query}" (limit: ${limit})`,
            confirmationMessages: {
                title: "Search Memory Database",
                message: new vscode.MarkdownString(
                    `Search the indexed code memory for: **"${query}"**\n\nThis will return up to ${limit} relevant code snippets.`
                ),
            },
        };
    }
}

// ============================================================================
// INDEX FILE TOOL
// ============================================================================

export interface IIndexFileParameters {
    filepath: string;
}

export class IndexFileTool
    implements vscode.LanguageModelTool<IIndexFileParameters> {
    constructor(private memoryService: MemoryService) { }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IIndexFileParameters>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { filepath } = options.input;

        try {
            // Read file content
            const fileUri = vscode.Uri.file(filepath);
            const content = await vscode.workspace.fs.readFile(fileUri);
            const text = Buffer.from(content).toString("utf8");

            // Determine language ID from file extension
            const ext = path.extname(filepath);
            const languageMap: Record<string, string> = {
                ".ts": "typescript",
                ".tsx": "typescriptreact",
                ".js": "javascript",
                ".jsx": "javascriptreact",
                ".py": "python",
                ".c": "c",
                ".cpp": "cpp",
                ".h": "c",
                ".java": "java",
                ".go": "go",
                ".rs": "rust",
                ".rb": "ruby",
                ".php": "php",
                ".cs": "csharp",
                ".swift": "swift",
                ".kt": "kotlin",
            };
            const languageId = languageMap[ext] || "plaintext";

            const result = await this.memoryService.addDocument(
                text,
                filepath,
                languageId
            );

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    `Successfully indexed file: ${path.basename(filepath)}\n` +
                    `Created ${result.chunksCreated} chunks in the memory database.`
                ),
            ]);
        } catch (error) {
            throw new Error(
                `Failed to index file "${filepath}": ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<IIndexFileParameters>,
        _token: vscode.CancellationToken
    ): Promise<vscode.PreparedToolInvocation> {
        const { filepath } = options.input;
        const filename = path.basename(filepath);

        return {
            invocationMessage: `Indexing file: ${filename}`,
            confirmationMessages: {
                title: "Index File to Memory",
                message: new vscode.MarkdownString(
                    `Add the following file to the memory index?\n\n**File:** \`${filepath}\`\n\nThis will parse the file and create searchable embeddings.`
                ),
            },
        };
    }
}

// ============================================================================
// GET INDEXED FILES TOOL
// ============================================================================

export interface IGetIndexedFilesParameters {
    // No parameters needed
}

export class GetIndexedFilesTool
    implements vscode.LanguageModelTool<IGetIndexedFilesParameters> {
    constructor(private memoryService: MemoryService) { }

    async invoke(
        _options: vscode.LanguageModelToolInvocationOptions<IGetIndexedFilesParameters>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        try {
            const files = await this.memoryService.getAllIndexedFiles();

            if (files.length === 0) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        "No files are currently indexed in the memory database."
                    ),
                ]);
            }

            let resultText = `Found ${files.length} indexed files:\n\n`;
            files.forEach((file, index) => {
                resultText += `${index + 1}. ${file.filepath} (${file.count} chunks)\n`;
            });

            const totalChunks = files.reduce((sum, f) => sum + f.count, 0);
            resultText += `\nTotal chunks in memory: ${totalChunks}`;

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(resultText),
            ]);
        } catch (error) {
            throw new Error(
                `Failed to get indexed files: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    async prepareInvocation(
        _options: vscode.LanguageModelToolInvocationPrepareOptions<IGetIndexedFilesParameters>,
        _token: vscode.CancellationToken
    ): Promise<vscode.PreparedToolInvocation> {
        return {
            invocationMessage: "Retrieving list of indexed files",
            confirmationMessages: {
                title: "List Indexed Files",
                message: new vscode.MarkdownString(
                    "Retrieve the list of all files currently indexed in the memory database?"
                ),
            },
        };
    }
}

// ============================================================================
// CLEAR MEMORY TOOL
// ============================================================================

export interface IClearMemoryParameters {
    filepath?: string;
}

export class ClearMemoryTool
    implements vscode.LanguageModelTool<IClearMemoryParameters> {
    constructor(private memoryService: MemoryService) { }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IClearMemoryParameters>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { filepath } = options.input;

        try {
            if (filepath) {
                await this.memoryService.deleteFileIndex(filepath);
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `Successfully removed file from memory: ${path.basename(filepath)}`
                    ),
                ]);
            } else {
                await this.memoryService.clearAllIndexes();
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        "Successfully cleared all files from the memory database."
                    ),
                ]);
            }
        } catch (error) {
            throw new Error(
                `Failed to clear memory: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<IClearMemoryParameters>,
        _token: vscode.CancellationToken
    ): Promise<vscode.PreparedToolInvocation> {
        const { filepath } = options.input;

        if (filepath) {
            return {
                invocationMessage: `Removing file from memory: ${path.basename(filepath)}`,
                confirmationMessages: {
                    title: "Remove File from Memory",
                    message: new vscode.MarkdownString(
                        `Remove the following file from the memory index?\n\n**File:** \`${filepath}\``
                    ),
                },
            };
        } else {
            return {
                invocationMessage: "Clearing all memory indexes",
                confirmationMessages: {
                    title: "Clear All Memory",
                    message: new vscode.MarkdownString(
                        "⚠️ **Warning:** This will remove ALL indexed files from the memory database.\n\nAre you sure you want to proceed?"
                    ),
                },
            };
        }
    }
}

// ============================================================================
// REGISTER ALL TOOLS
// ============================================================================

export function registerMemoryTools(
    context: vscode.ExtensionContext,
    memoryService: MemoryService
) {
    context.subscriptions.push(
        vscode.lm.registerTool(
            "agent-memory_search_memory",
            new SearchMemoryTool(memoryService)
        )
    );

    context.subscriptions.push(
        vscode.lm.registerTool(
            "agent-memory_index_file",
            new IndexFileTool(memoryService)
        )
    );

    context.subscriptions.push(
        vscode.lm.registerTool(
            "agent-memory_list_indexed",
            new GetIndexedFilesTool(memoryService)
        )
    );

    context.subscriptions.push(
        vscode.lm.registerTool(
            "agent-memory_clear_memory",
            new ClearMemoryTool(memoryService)
        )
    );

    console.log("Agent Memory: Tools registered for Agent Mode");
}
