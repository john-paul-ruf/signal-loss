import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * CSP is a production-only concern: dev requires WebSocket HMR, which
 * `connect-src 'none'` would forbid. In build, we inject the strict policy so
 * the shipping HTML enforces NFR-8 in the browser regardless of hosting headers.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "connect-src 'none'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

function cspMetaPlugin(): Plugin {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`;
  return {
    name: "signal-loss:csp-meta",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (html.includes("Content-Security-Policy")) {
          return html.replace(
            /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/i,
            meta,
          );
        }
        return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n    ${meta}`);
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwind(),
    cspMetaPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,svg,json}"],
        navigateFallback: "index.html",
      },
      manifest: {
        id: "/",
        name: "SIGNAL LOSS",
        short_name: "SIGNAL LOSS",
        description:
          "Deterministic simultaneous-turn browser tactics — no rolls, no timers.",
        background_color: "#04060A",
        theme_color: "#04060A",
        display: "standalone",
        orientation: "landscape",
        start_url: "./",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  build: {
    target: "es2022",
    sourcemap: true,
    cssCodeSplit: true,
    modulePreload: { polyfill: false },
  },
  worker: {
    format: "es",
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
  },
});
