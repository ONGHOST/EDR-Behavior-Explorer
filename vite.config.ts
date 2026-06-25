import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies /api/* to the BehaviorEngine backend (default :8787) so
// the browser never makes a cross-origin request — same pattern as GitArchi.
// Override the target with EDR_API_PROXY_TARGET if your backend runs elsewhere.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.EDR_API_PROXY_TARGET ?? "http://localhost:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
