declare module 'wawoff2' {
  export function decompress(input: Buffer | Uint8Array): Promise<Buffer>;
  export function compress(input: Buffer | Uint8Array): Promise<Buffer>;
  const _default: {
    decompress: typeof decompress;
    compress: typeof compress;
  };
  export default _default;
}
