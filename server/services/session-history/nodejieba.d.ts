/**
 * Optional dependency: nodejieba Chinese word segmentation
 * This module may not be installed - code handles absence gracefully via try/catch.
 */
declare module 'nodejieba' {
  interface Jieba {
    cut(text: string, hmm?: boolean): string[];
  }
  const jieba: Jieba;
  export = jieba;
}
