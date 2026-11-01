// Vite replaces import.meta.env.DEV at build time: true in the dev server and tests, false in
// production builds, where code behind it is dropped.
interface ImportMetaEnv {
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
