import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

/**
 * Engine tests run in Node (no DOM required). The route-registry smoke test is
 * data-driven and does not touch document. Later UI sessions that need DOM add
 * `// @vitest-environment jsdom` on the specific test file, keeping the shared
 * runner fast.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      globals: false,
      include: ["tests/**/*.test.{ts,tsx}"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "tests/e2e/**",
      ],
      reporters: ["default"],
      passWithNoTests: false,
    },
  }),
);
