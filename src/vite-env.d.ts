/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CORE_URL: string;
  readonly VITE_EDGE_URL: string;
  readonly VITE_SIGNAL_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
