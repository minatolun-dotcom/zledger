import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// During `vite dev` the API is proxied to the local/docker API. In production
// the built assets are served by nginx which proxies /api itself.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        host: true,
        proxy: {
            "/api": {
                target: process.env.VITE_API_PROXY || "http://localhost:8000",
                changeOrigin: true,
            },
        },
    },
    preview: {
        port: 4173,
        proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
    },
});
