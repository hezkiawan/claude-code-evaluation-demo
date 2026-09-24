import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig uses "jsx": "preserve" for Next.js; tests need the runtime transform.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      include: ["lib/**", "components/**"],
      exclude: ["**/*.test.*", "lib/firebase.ts"],
    },
  },
});
