export {};

declare global {
  interface Window {
    readonly novelDesktop: Readonly<{
      readonly version: 1;
    }>;
  }
}
