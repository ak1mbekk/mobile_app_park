/// <reference types="vite/client" />

declare global {
  interface Window {
    api?: {
      app: { getVersion: () => Promise<string> };
    };
  }
}

export {};
