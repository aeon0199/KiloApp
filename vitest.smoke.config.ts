import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.smoke.test.ts", "src/**/*.smoke.test.tsx"],
    globals: true,
    css: false,
    testTimeout: 20000,
  },
});
