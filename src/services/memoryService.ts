import * as lancedb from "@lancedb/lancedb";
import * as vscode from "vscode";
import * as path from "path";
import { EmbeddingService } from "./embeddingService";
import { ChunkingService } from "./chunkingService";

export class MemoryService {
  private db: lancedb.Connection | undefined;
  private table: lancedb.Table | undefined;
  private chunkingService: ChunkingService = new ChunkingService();

  // Initialize DB in the extension's global storage
  async init(context: vscode.ExtensionContext) {
    await this.chunkingService.init(context);
    const config = vscode.workspace.getConfiguration("agentMemory");
    const scope = config.get<string>("storageScope");
    let storageUri: vscode.Uri;

    if (scope === "global") {
      storageUri = context.globalStorageUri;
    } else {
      storageUri = context.storageUri || context.globalStorageUri;
    }
    // Ensure directory exists (VS Code helper)
    await vscode.workspace.fs.createDirectory(storageUri);

    const dbPath = path.join(storageUri.fsPath, "memory-db");
    this.db = await lancedb.connect(dbPath);

    // table name: 'code_context'
    try {
      this.table = await this.db.openTable("code_context");
    } catch {
      // Create table if missing. Dimension 384 matches 'all-MiniLM-L6-v2'
      this.table = await this.db.createTable("code_context", [
        { vector: Array(384).fill(0), text: "init", filepath: "init", id: "0" },
      ]);
    }
  }

  // Add code to memory
  async addDocument(text: string, filepath: string, languageId?: string): Promise<{ chunksCreated: number }> {
    if (!text.trim()) {
      return { chunksCreated: 0 };
    }

    const { v4: uuidv4 } = await import("uuid");

    // Use chunking service to split code intelligently
    let chunks: string[];
    if (languageId && this.chunkingService.isLanguageSupported(languageId)) {
      chunks = await this.chunkingService.chunk(text, languageId, 500);
    } else {
      // Fallback: simple text chunking
      chunks = this._simpleChunk(text, 500);
    }

    // Generate embeddings and add each chunk to the database
    const records = [];
    for (const chunk of chunks) {
      if (chunk.trim().length === 0) {
        continue;
      }
      
      const vector = await EmbeddingService.getEmbedding(chunk);
      records.push({
        vector: vector,
        text: chunk,
        filepath: filepath,
        id: uuidv4(),
      });
    }

    if (records.length > 0) {
      await this.table?.add(records);
    }

    return { chunksCreated: records.length };
  }

  // Simple fallback chunking by character count
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

  // Retrieve relevant code
  async search(query: string, limit: number = 3) {
    const queryVector = await EmbeddingService.getEmbedding(query);
    const results = await this.table
      ?.search(queryVector)
      .limit(limit)
      .toArray();
    return results || [];
  }

  // Get all indexed files with their chunk counts
  async getAllIndexedFiles(): Promise<{ filepath: string; count: number }[]> {
    if (!this.table) {
      return [];
    }

    try {
      const allRecords = await this.table.query().toArray();
      
      // Filter out init record and group by filepath
      const fileMap = new Map<string, number>();
      for (const record of allRecords) {
        if (record.filepath && record.filepath !== 'init') {
          fileMap.set(record.filepath, (fileMap.get(record.filepath) || 0) + 1);
        }
      }

      return Array.from(fileMap.entries()).map(([filepath, count]) => ({
        filepath,
        count
      }));
    } catch (error) {
      console.error('Error getting indexed files:', error);
      return [];
    }
  }

  // Get all chunks for a specific file
  async getFileChunks(filepath: string): Promise<Array<{ id: string; text: string; filepath: string }>> {
    if (!this.table) {
      return [];
    }

    try {
      const allRecords = await this.table.query().toArray();
      return allRecords
        .filter(r => r.filepath === filepath)
        .map(r => ({
          id: r.id,
          text: r.text,
          filepath: r.filepath
        }));
    } catch (error) {
      console.error('Error getting file chunks:', error);
      return [];
    }
  }

  // Get all chunks with their vectors for a specific file
  async getFileChunksWithVectors(filepath: string): Promise<Array<{ 
    id: string; 
    text: string; 
    filepath: string; 
    vector: number[] 
  }>> {
    if (!this.table) {
      return [];
    }

    try {
      const allRecords = await this.table.query().toArray();
      return allRecords
        .filter(r => r.filepath === filepath)
        .map(r => ({
          id: r.id,
          text: r.text,
          filepath: r.filepath,
          vector: r.vector
        }));
    } catch (error) {
      console.error('Error getting file chunks with vectors:', error);
      return [];
    }
  }

  // Get total count of indexed chunks
  async getIndexedChunkCount(): Promise<number> {
    if (!this.table) {
      return 0;
    }

    try {
      const allRecords = await this.table.query().toArray();
      // Filter out init record
      return allRecords.filter(r => r.filepath !== 'init').length;
    } catch (error) {
      console.error('Error getting chunk count:', error);
      return 0;
    }
  }

  // Clear all indexed files from memory
  async clearAllIndexes(): Promise<void> {
    if (!this.table) {
      return;
    }

    try {
      // Delete all records except init
      const allRecords = await this.table.query().toArray();
      const idsToDelete = allRecords
        .filter(r => r.filepath !== 'init')
        .map(r => r.id);

      if (idsToDelete.length > 0) {
        for (const id of idsToDelete) {
          await this.table.delete(`id = '${id}'`);
        }
      }
    } catch (error) {
      console.error('Error clearing indexes:', error);
      throw error;
    }
  }

  // Delete a specific file from index
  async deleteFileIndex(filepath: string): Promise<void> {
    if (!this.table) {
      return;
    }

    try {
      await this.table.delete(`filepath = '${filepath.replace(/'/g, "''")}'`);
    } catch (error) {
      console.error('Error deleting file index:', error);
      throw error;
    }
  }

  // Delete all files in a folder from index
  async deleteFolderIndex(folderPath: string): Promise<number> {
    if (!this.table) {
      return 0;
    }

    try {
      const allRecords = await this.table.query().toArray();
      const filesToDelete = allRecords.filter(r => {
        const dir = require('path').dirname(r.filepath);
        return dir === folderPath;
      });

      for (const record of filesToDelete) {
        await this.table.delete(`id = '${record.id}'`);
      }

      return filesToDelete.length;
    } catch (error) {
      console.error('Error deleting folder index:', error);
      throw error;
    }
  }
}
