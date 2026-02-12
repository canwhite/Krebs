/**
 * Formidable 类型定义
 * 为 CommonJS 的 require() 提供类型支持
 */

declare module 'formidable' {
  interface File {
    file: string;
    originalFilename: string;
    filepath: string;
    mimetype: string;
    size: number;
  }

  interface FilesDictionary {
    [key: string]: File;
  }

  interface Options {
    encoding?: string | null;
    maxFileSize?: number;
    multiples?: boolean;
    uploadDir?: string;
    keepExtensions?: boolean;
    hash?: string;
  }

  interface IncomingForm {
    _events: NodeJS.EventEmitter;
    open(): void;
  }

  export interface FileServer {
    upload(options: Options): IncomingForm;
  }
}
