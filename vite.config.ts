import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          markdown: ["react-markdown", "remark-gfm", "react-syntax-highlighter"],
          terminal: ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-webgl"],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
