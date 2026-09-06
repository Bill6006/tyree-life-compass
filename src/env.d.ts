/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __BUILD_INFO__: {
  commit: string;
  builtAt: string;
  runUrl: string | null;
  phase: number;
};
