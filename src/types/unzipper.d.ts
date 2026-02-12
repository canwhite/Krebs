/**
 * Unzipper 类型定义
 * 为 CommonJS 的 require() 提供类型支持
 */

declare module 'unzipper' {
  import { Readable } from 'stream';

  interface ExtractOptions {
    path: string;
  }

  export class Extract extends Readable {
    constructor(options: ExtractOptions);
  }

  export function Parse(): void;
}
