# Agent Memory

**Agent Memory** is a Visual Studio Code extension that gives GitHub Copilot "Long-Term Memory" by indexing your codebase into a local vector database. It enables Retrieval-Augmented Generation (RAG) directly within VS Code, allowing you to ask questions about your entire project with high accuracy.

## Why Agent Memory?

Standard LLM context windows are limited. When you work on large projects, Copilot doesn't know about files you haven't opened or referenced. **Agent Memory** solves this by:

1.  **Indexing your code**: It parses your source code into semantic chunks (functions, classes) using Tree-sitter.
2.  **Creating Embeddings**: It converts these chunks into vector embeddings locally using `@xenova/transformers`.
3.  **Storing Locally**: It saves these vectors in a local LanceDB database. **No code leaves your machine** for indexing.
4.  **Retrieving Context**: When you chat with `@memory`, it semantically searches your codebase and provides the most relevant snippets to the LLM.

## Features

-   **Smart Chunking**: Uses AST (Abstract Syntax Tree) parsing to split code by logical units (functions, classes) rather than arbitrary lines. Supports TypeScript, Python, C++, Go, Rust, Java, and more.
-   **Local & Private**: All embeddings and vector data are generated and stored locally on your machine.
-   **Seamless Integration**: Works directly with GitHub Copilot Chat via the `@memory` participant.
-   **🆕 Agent Mode Support**: The extension now provides tools that Copilot's Agent Mode can use autonomously:
    -   `#searchMemory` - Search through indexed code semantically
    -   `#indexFile` - Add files to the memory index
    -   `#listIndexed` - List all indexed files
    -   `#clearMemory` - Remove files from the index
-   **Memory Management**:
    -   **"Memory Files" View**: See exactly what files are indexed, grouped by folder.
    -   **Visual Inspection**: View the actual text chunks and vector data generated for any file.
    -   **Easy Management**: Add or remove files/folders via context menus.

## Usage

### 1. Indexing Code
You can index individual files or entire folders:
-   **Right-click a file/folder** in the Explorer and select **"Add File/Folder to Memory Index"**.
-   Open a file and run the command **"Add File to Memory Index"** from the Command Palette.

### 2. Chatting with Memory
Open GitHub Copilot Chat and use the `@memory` participant:

```
@memory How does the authentication service work?
@memory Where is the user validation logic located?
@memory Explain the relationship between the ChunkingService and MemoryService.
```

The extension will search your indexed code, retrieve relevant chunks, and use them to answer your question.

### 3. Managing Memory
Click the **Agent Memory** icon in the Activity Bar (database icon) to open the **Indexed Files** view.
-   **View Chunks**: Right-click a file -> **View Chunks** to see how your code was split.
-   **View Vectors**: Right-click a file -> **View Vectors** to inspect the raw vector data.
-   **Delete**: Remove files or folders from the index.

### 4. Using with Agent Mode (NEW!)
When Copilot is in **Agent Mode**, it can autonomously use the memory tools to help with your tasks:

1. **Switch to Agent Mode**: In Copilot Chat, select "Agent" mode from the dropdown.
2. **Reference tools directly**: You can reference tools in your prompts using `#`:
   ```
   Can you #searchMemory for how the authentication is implemented?
   Please #indexFile for the src/services/auth.ts file
   Show me #listIndexed files
   ```
3. **Autonomous usage**: In Agent Mode, Copilot will automatically decide when to search your indexed memory to answer questions about your codebase.

**Available Tools:**
| Tool | Reference | Description |
|------|-----------|-------------|
| Search Memory | `#searchMemory` | Semantically search through indexed code |
| Index File | `#indexFile` | Add a file to the memory database |
| List Indexed | `#listIndexed` | Show all files currently in memory |
| Clear Memory | `#clearMemory` | Remove files from the index |

## Configuration

You can customize the extension in VS Code Settings (`Ctrl+,`):

-   `agentMemory.storageScope`:
    -   `workspace` (Default): Creates a separate database for each workspace.
    -   `global`: Shares one database across all VS Code instances.
-   `agentMemory.indexing.maxFileSize`: Max file size to index (default: 1MB).
-   `agentMemory.indexing.excludePatterns`: Glob patterns to ignore (e.g., `node_modules`, `dist`).
-   `agentMemory.indexing.includeExtensions`: File types to include when indexing folders.

## Development Guide

If you want to contribute or modify the extension:

### Prerequisites
-   Node.js (v18 or higher)
-   Visual Studio Code

### Setup
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Compile the extension:
    ```bash
    npm run compile
    ```
    *Note: This step copies the required `tree-sitter.wasm` file to the output directory.*

### Running & Debugging
1.  Open the project in VS Code.
2.  Press `F5` to start the "Extension Development Host".
3.  In the new window, open a folder and test the commands.

### Testing
Run the test suite:
```bash
npm test
```

### Release & Changelog
This project uses [Conventional Commits](https://www.conventionalcommits.org/) and [standard-version](https://github.com/conventional-changelog/standard-version) to automate versioning and changelog generation.

1.  **Commit Changes**: Ensure your commit messages follow the conventional format:
    ```bash
    git commit -m "feat: add new chunking strategy"
    git commit -m "fix: resolve indexing timeout"
    ```
    *A git hook will verify your commit message format.*

2.  **Create Release**: Run the release script to bump version and update `CHANGELOG.md`:
    ```bash
    npm run release
    ```
    This will:
    -   Bump the version in `package.json`.
    -   Update `CHANGELOG.md` with commits since the last release.
    -   Commit the changes and tag the release.

3.  **Push**: This will trigger the GitHub Action to publish to the marketplace:
    ```bash
    git push --follow-tags origin main
    ```

### Publishing to VS Code Marketplace

**Automated Publishing** (via GitHub Actions):
1.  Create a Personal Access Token (PAT) from [Azure DevOps](https://dev.azure.com/):
    -   Click on your profile → **Security** → **Personal access tokens**.
    -   Create a new token with **Marketplace (Manage)** scope.
2.  Add the token to your GitHub repository secrets:
    -   Go to **Settings** → **Secrets and variables** → **Actions**.
    -   Add a new secret named `VSCE_PAT` with your token.
3.  Push a tag (via `npm run release`) to trigger automatic publishing.

**Manual Publishing**:
```bash
npx @vscode/vsce publish
```

### Packaging
To create a VSIX file for manual installation:

1.  Run the package command using `npx`:
    ```bash
    npx @vscode/vsce package
    ```
    This will generate an `agent-memory-0.0.1.vsix` file in the project root.

2.  To install the VSIX:
    -   Open VS Code Extensions view.
    -   Click the "..." menu.
    -   Select "Install from VSIX...".

## License

MIT
