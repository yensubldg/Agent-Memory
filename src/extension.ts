import * as vscode from "vscode";
import * as path from "path";
import { MemoryService } from "./services/memoryService";
import { MemoryViewProvider } from "./memoryViewProvider";

const memoryService = new MemoryService();

export async function activate(context: vscode.ExtensionContext) {
  await memoryService.init(context);
  console.log("Agent Memory: DB Initialized");

  const memoryViewProvider = new MemoryViewProvider(memoryService);
  const treeView = vscode.window.createTreeView("agentMemoryView", {
    treeDataProvider: memoryViewProvider,
    showCollapseAll: false,
  });

  context.subscriptions.push(treeView);

  const indexCommand = vscode.commands.registerCommand(
    "agent-memory.indexFile",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const text = editor.document.getText();
        const filepath = editor.document.uri.fsPath;
        const languageId = editor.document.languageId;
        const filename = path.basename(filepath);

        let chunkCount = 0;
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Agent Memory: Indexing ${filename}...`,
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: "Chunking code..." });

            const result = await memoryService.addDocument(
              text,
              filepath,
              languageId
            );
            chunkCount = result.chunksCreated;

            progress.report({
              message: `Created ${chunkCount} chunks`,
              increment: 50,
            });

            progress.report({
              message: "Generating embeddings...",
              increment: 25,
            });

            progress.report({
              message: "Storing in database...",
              increment: 25,
            });
          }
        );

        const totalCount = await memoryService.getIndexedChunkCount();
        vscode.window.showInformationMessage(
          `Indexed: ${filename} (${chunkCount} chunks created, ${totalCount} total)`
        );

        memoryViewProvider.refresh();
      }
    }
  );

  const indexFolderCommand = vscode.commands.registerCommand(
    "agent-memory.indexFolder",
    async (uri?: vscode.Uri) => {
      let folderPath: string | undefined;

      if (uri) {
        folderPath = uri.fsPath;
      } else {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
          vscode.window.showErrorMessage("No workspace folder open.");
          return;
        }

        if (folders.length === 1) {
          folderPath = folders[0].uri.fsPath;
        } else {
          const selected = await vscode.window.showWorkspaceFolderPick({
            placeHolder: "Select folder to index",
          });
          if (!selected) {
            return;
          }
          folderPath = selected.uri.fsPath;
        }
      }

      if (!folderPath) {
        return;
      }

      // Import FolderIndexer
      const { FolderIndexer } = await import("./services/folderIndexer.js");

      // Validate before indexing
      const validation = await FolderIndexer.validateIndexingOperation(
        folderPath
      );

      if (!validation.valid) {
        vscode.window.showWarningMessage(validation.message);
        return;
      }

      // Show confirmation dialog
      const answer = await vscode.window.showWarningMessage(
        validation.message + "\n\nDo you want to proceed?",
        { modal: true },
        "Yes, Index Folder",
        "Configure Options"
      );

      if (answer === "Configure Options") {
        vscode.window.showInformationMessage(
          "Configure indexing options in settings: agentMemory.*"
        );
        return;
      }

      if (answer !== "Yes, Index Folder") {
        return;
      }

      // Get files to index
      const files = await FolderIndexer.getFilesToIndex(folderPath);

      let indexed = 0;
      let failed = 0;
      let totalChunks = 0;

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Agent Memory: Indexing folder...",
          cancellable: true,
        },
        async (progress, token) => {
          for (let i = 0; i < files.length; i++) {
            if (token.isCancellationRequested) {
              vscode.window.showWarningMessage(
                `Indexing cancelled. Indexed ${indexed}/${files.length} files.`
              );
              break;
            }

            const file = files[i];
            const filename = path.basename(file);

            progress.report({
              message: `${i + 1}/${files.length}: ${filename}`,
              increment: 100 / files.length,
            });

            try {
              const content = await vscode.workspace.fs.readFile(
                vscode.Uri.file(file)
              );
              const text = Buffer.from(content).toString("utf8");
              const ext = path.extname(file);

              // Map extension to language ID
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
              const result = await memoryService.addDocument(
                text,
                file,
                languageId
              );
              totalChunks += result.chunksCreated;
              indexed++;
              if (i % 10 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
            } catch (error) {
              failed++;
              console.error(`Failed to index ${file}:`, error);
            }
          }
        }
      );

      memoryViewProvider.refresh();

      const summary =
        `Folder indexing complete!\n` +
        `Files indexed: ${indexed}\n` +
        `Failed: ${failed}\n` +
        `Total chunks created: ${totalChunks}`;

      vscode.window.showInformationMessage(summary);
    }
  );

  const showIndexedFilesCommand = vscode.commands.registerCommand(
    "agent-memory.showIndexedFiles",
    async () => {
      const files = await memoryService.getAllIndexedFiles();

      if (files.length === 0) {
        vscode.window.showInformationMessage("No files indexed yet.");
        return;
      }

      const items = files.map((f) => ({
        label: path.basename(f.filepath),
        description: f.filepath,
        detail: `${f.count} chunks`,
      }));

      await vscode.window.showQuickPick(items, {
        placeHolder: "Indexed files in memory",
        title: "Agent Memory - Indexed Files",
      });
    }
  );

  const refreshMemoryViewCommand = vscode.commands.registerCommand(
    "agent-memory.refreshView",
    () => {
      memoryViewProvider.refresh();
    }
  );

  const clearAllCommand = vscode.commands.registerCommand(
    "agent-memory.clearAll",
    async () => {
      const answer = await vscode.window.showWarningMessage(
        "Are you sure you want to clear all indexed files from memory?",
        { modal: true },
        "Yes, Clear All"
      );

      if (answer === "Yes, Clear All") {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Agent Memory: Clearing all indexes...",
          },
          async () => {
            await memoryService.clearAllIndexes();
          }
        );

        memoryViewProvider.refresh();
        vscode.window.showInformationMessage("All memory indexes cleared.");
      }
    }
  );

  const deleteFileCommand = vscode.commands.registerCommand(
    "agent-memory.deleteFile",
    async (item: any) => {
      if (item && item.filepath) {
        const filename = path.basename(item.filepath);
        const answer = await vscode.window.showWarningMessage(
          `Remove "${filename}" from memory?`,
          "Yes",
          "No"
        );

        if (answer === "Yes") {
          await memoryService.deleteFileIndex(item.filepath);
          memoryViewProvider.refresh();
          vscode.window.showInformationMessage(
            `Removed ${filename} from memory.`
          );
        }
      }
    }
  );

  const deleteFolderCommand = vscode.commands.registerCommand(
    "agent-memory.deleteFolder",
    async (item: any) => {
      if (item && item.filepath && item.itemType === "folder") {
        const folderName = path.basename(item.filepath);
        const fileCount = item.children?.length || 0;

        const answer = await vscode.window.showWarningMessage(
          `Remove all ${fileCount} files in folder "${folderName}" from memory?`,
          { modal: true },
          "Yes, Remove All"
        );

        if (answer === "Yes, Remove All") {
          const deletedCount = await memoryService.deleteFolderIndex(
            item.filepath
          );
          memoryViewProvider.refresh();
          vscode.window.showInformationMessage(
            `Removed ${deletedCount} files from folder "${folderName}".`
          );
        }
      }
    }
  );

  const viewFileChunksCommand = vscode.commands.registerCommand(
    "agent-memory.viewFileChunks",
    async (item: any) => {
      if (item && item.filepath) {
        const chunks = await memoryService.getFileChunks(item.filepath);

        if (chunks.length === 0) {
          vscode.window.showInformationMessage(
            "No chunks found for this file."
          );
          return;
        }

        // Create a virtual document to display chunks
        const content = chunks
          .map((chunk, index) => {
            return `// ========== Chunk ${index + 1} (ID: ${chunk.id.substring(
              0,
              8
            )}...) ==========\n${chunk.text}\n\n`;
          })
          .join("\n");

        const doc = await vscode.workspace.openTextDocument({
          content: content,
          language: "typescript",
        });

        await vscode.window.showTextDocument(doc, {
          preview: true,
          viewColumn: vscode.ViewColumn.Beside,
        });
      }
    }
  );

  const viewFileVectorsCommand = vscode.commands.registerCommand(
    "agent-memory.viewFileVectors",
    async (item: any) => {
      if (item && item.filepath) {
        const chunks = await memoryService.getFileChunksWithVectors(
          item.filepath
        );

        if (chunks.length === 0) {
          vscode.window.showInformationMessage(
            "No vectors found for this file."
          );
          return;
        }

        // Create a JSON document to display vectors
        const content = JSON.stringify(
          {
            file: item.filepath,
            totalChunks: chunks.length,
            vectorDimension: chunks[0].vector.length,
            chunks: chunks.map((chunk, index) => {
              const vector: number[] = Array.isArray(chunk.vector)
                ? chunk.vector
                : Array.from(chunk.vector);
              const sum: number = vector.reduce((a, b) => a + b, 0);
              const min: number = vector.reduce(
                (a, b) => Math.min(a, b),
                vector[0] || 0
              );
              const max: number = vector.reduce(
                (a, b) => Math.max(a, b),
                vector[0] || 0
              );

              return {
                chunkNumber: index + 1,
                id: chunk.id,
                textPreview:
                  chunk.text.substring(0, 100) +
                  (chunk.text.length > 100 ? "..." : ""),
                textLength: chunk.text.length,
                vector: vector,
                vectorStats: {
                  min: min,
                  max: max,
                  avg: sum / vector.length,
                },
              };
            }),
          },
          null,
          2
        );

        const doc = await vscode.workspace.openTextDocument({
          content: content,
          language: "json",
        });

        await vscode.window.showTextDocument(doc, {
          preview: true,
          viewColumn: vscode.ViewColumn.Beside,
        });
      }
    }
  );

  const handler: vscode.ChatRequestHandler = async (
    request,
    context,
    stream,
    token
  ) => {
    stream.progress("Searching long-term memory...");

    const searchResults = await memoryService.search(request.prompt);

    let contextBlock = "";
    if (searchResults.length > 0) {
      contextBlock =
        "I found the following relevant code in your database:\n\n";
      searchResults.forEach((doc: any) => {
        contextBlock += `--- File: ${doc.filepath} ---\n${doc.text}\n\n`;
      });
    } else {
      contextBlock = "No relevant code found in memory database.\n";
    }

    // C. Prepare messages for the LLM
    const messages = [
      vscode.LanguageModelChatMessage.User(
        `You are a helpful coding assistant with access to a memory database. 
                 Use the Context below to answer the user's question.                 
                 ${contextBlock}`
      ),
      vscode.LanguageModelChatMessage.User(request.prompt),
    ];

    const models = await vscode.lm.selectChatModels();
    if (models.length > 0) {
      const model = models[0];
      const response = await model.sendRequest(messages, {}, token);
      for await (const fragment of response.text) {
        stream.markdown(fragment);
      }
    } else {
      stream.markdown(
        "Error: No supported LLM models found. Please ensure GitHub Copilot is active."
      );
    }
  };

  const chatParticipant = vscode.chat.createChatParticipant(
    "agent.memory",
    handler
  );

  chatParticipant.iconPath = vscode.Uri.joinPath(
    context.extensionUri,
    "media",
    "icon-chat.jpg"
  );

  context.subscriptions.push(
    indexCommand,
    indexFolderCommand,
    showIndexedFilesCommand,
    refreshMemoryViewCommand,
    clearAllCommand,
    deleteFileCommand,
    deleteFolderCommand,
    viewFileChunksCommand,
    viewFileVectorsCommand,
    chatParticipant
  );
}

// This method is called when your extension is deactivated
export async function deactivate() {
  try {
    console.log("Agent Memory: Deactivating and cleaning up resources...");
    // The LanceDB connection will be closed automatically when the process ends
    // No explicit cleanup needed for the current implementation
  } catch (error) {
    console.error("Error during deactivation:", error);
  }
}
