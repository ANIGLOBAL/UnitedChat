import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Luôn build với base "/": index.html do scripts/write-index.mjs dựng lại với
// prefix UNITEDCHAT_BASE, còn entry.client tự nhận basename từ URL module.
export default defineConfig({
  base: "/",
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
