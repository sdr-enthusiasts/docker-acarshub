import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/*.config.*",
        "**/__tests__/**",
        "**/types/**",
      ],
    },
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
  },
});
