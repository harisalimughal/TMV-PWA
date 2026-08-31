/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only flag. Set to "false" to disable the in-repo mock API and talk to a
   *  real backend on the Vite proxy target instead. Defaults to on in `npm run dev`. */
  readonly VITE_MOCK_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
