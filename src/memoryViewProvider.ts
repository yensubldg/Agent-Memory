import * as vscode from 'vscode';
import * as path from 'path';
import { MemoryService } from './services/memoryService';

interface FolderGroup {
    folderPath: string;
    files: Array<{ filepath: string; count: number }>;
    totalChunks: number;
}

export class MemoryViewProvider implements vscode.TreeDataProvider<MemoryItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MemoryItem | undefined | null | void> = new vscode.EventEmitter<MemoryItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MemoryItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private memoryService: MemoryService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: MemoryItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: MemoryItem): Promise<MemoryItem[]> {
        if (!element) {
            // Root level - show folders
            const files = await this.memoryService.getAllIndexedFiles();
            
            if (files.length === 0) {
                return [];
            }

            // Group files by folder
            const folderMap = new Map<string, FolderGroup>();
            
            for (const file of files) {
                const dir = path.dirname(file.filepath);
                
                if (!folderMap.has(dir)) {
                    folderMap.set(dir, {
                        folderPath: dir,
                        files: [],
                        totalChunks: 0
                    });
                }
                
                const group = folderMap.get(dir)!;
                group.files.push(file);
                group.totalChunks += file.count;
            }

            // Convert to tree items
            const items: MemoryItem[] = [];
            
            for (const [folderPath, group] of folderMap.entries()) {
                items.push(new MemoryItem(
                    path.basename(folderPath) || folderPath,
                    folderPath,
                    group.totalChunks,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'folder',
                    group.files
                ));
            }

            // Sort by folder name
            items.sort((a, b) => a.label.localeCompare(b.label));
            
            return items;
        } else if (element.itemType === 'folder' && element.children) {
            // Show files in folder
            return element.children.map(file => new MemoryItem(
                path.basename(file.filepath),
                file.filepath,
                file.count,
                vscode.TreeItemCollapsibleState.None,
                'file'
            ));
        }

        return [];
    }
}

class MemoryItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly filepath: string,
        public readonly chunkCount: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: 'folder' | 'file' = 'file',
        public readonly children?: Array<{ filepath: string; count: number }>
    ) {
        super(label, collapsibleState);
        
        if (itemType === 'folder') {
            const fileCount = children?.length || 0;
            this.tooltip = `${filepath}\n${fileCount} files, ${chunkCount} chunks`;
            this.description = `${fileCount} files, ${chunkCount} chunks`;
            this.contextValue = 'memoryFolder';
            this.iconPath = new vscode.ThemeIcon('folder');
        } else {
            this.tooltip = `${filepath}\n${chunkCount} chunks`;
            this.description = `${chunkCount} chunks`;
            this.contextValue = 'memoryFile';
            this.iconPath = new vscode.ThemeIcon('file-code');
            
            // Make file clickable to open
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(filepath)]
            };
        }
    }
}
