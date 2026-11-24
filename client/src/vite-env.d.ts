/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
  /** Default game server (wss://...), from a GitHub Actions repository variable; empty = offline. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
