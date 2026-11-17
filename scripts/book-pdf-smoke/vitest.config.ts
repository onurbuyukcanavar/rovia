import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Yalnızca PDF duman testi (bkz. smoke.test.tsx). */
export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  test: { include: ["scripts/book-pdf-smoke/*.test.tsx"], testTimeout: 120_000 },
});
