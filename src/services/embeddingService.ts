export class EmbeddingService {
  private static instance: any = null;

  // Initialize the model (downloads on first run)
  static async getInstance() {
    if (!this.instance) {
      // 'feature-extraction' creates vectors from text
      const { pipeline } = await import("@xenova/transformers");
      this.instance = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2"
      );
    }
    return this.instance;
  }

  // Convert text string to vector array
  static async getEmbedding(text: string): Promise<number[]> {
    const pipe = await this.getInstance();
    const output = await pipe(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  }
}
