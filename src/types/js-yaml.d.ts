declare module 'js-yaml' {
  export interface DumpOptions { noRefs?: boolean; lineWidth?: number }
  export function load(input: string): unknown;
  export function dump(input: unknown, options?: DumpOptions): string;
}
