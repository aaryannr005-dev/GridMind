import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const frontendRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(frontendRoot, "src/renderer"),
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(frontendRoot, "preview-dist"),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(frontendRoot, "src/renderer/preview.html"),
      output: { inlineDynamicImports: true },
    },
  },
});
