/* Aliased in vitest.config.ts so `import "server-only"` is a no-op in tests.
   In Next.js production builds, the real `server-only` package errors when
   bundled into client code — this shim simply silences it for vitest. */
export {};
