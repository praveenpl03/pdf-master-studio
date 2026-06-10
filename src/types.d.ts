declare module 'qpdf-wasm' {
  interface QpdfModule {
    FS: {
      writeFile(path: string, data: Uint8Array): void;
      readFile(path: string): Uint8Array;
      unlink?(path: string): void;
    };
    callMain(args: string[]): number;
  }

  export default function init(moduleArg?: Record<string, unknown> & { wasmBinary?: Uint8Array }): Promise<QpdfModule>;
}
