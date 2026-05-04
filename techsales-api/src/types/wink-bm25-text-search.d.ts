/**
 * Minimal ambient typings for `wink-bm25-text-search`. The package ships no
 * `.d.ts` files; we only use a small surface (defineConfig, definePrepTasks,
 * addDoc, consolidate, search), so this hand-written shim is enough.
 */
declare module 'wink-bm25-text-search' {
  export interface BM25Engine {
    defineConfig(cfg: Record<string, unknown>): unknown;
    definePrepTasks(tasks: Array<(text: string) => string[]>): unknown;
    addDoc(doc: Record<string, string>, id: string | number): unknown;
    consolidate(fp?: number): unknown;
    search(query: string, limit?: number): Array<[string | number, number]>;
    reset(): unknown;
    getDocs(): unknown;
    getTokens(): unknown;
    getIDF(): unknown;
    getConfig(): unknown;
    getTotalCorpusLength(): number;
    getTotalDocs(): number;
    exportJSON(): string;
    importJSON(json: string): unknown;
    learn(doc: Record<string, string>, id: string | number): unknown;
    predict(query: string, limit?: number): Array<[string | number, number]>;
  }

  /** Default export — a factory that returns a fresh engine instance. */
  const bm25Factory: () => BM25Engine;
  export default bm25Factory;
}
