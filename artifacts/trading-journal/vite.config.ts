import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// PORT is only meaningful at runtime (dev server / preview). During a
// production build (e.g. Railway CI) no PORT is available — default to 3000.
const rawPort = process.env.PORT ?? "3000";
const port = Number(rawPort);
// PORT is safe to ignore during `vite build`; Vite only reads server.port at
// dev/preview time, so an invalid value here has no effect on the build output.

// BASE_PATH defaults to "/" so the app works without the env var at build time.
const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    // Railway's start command (`vite preview`) and any static-file host serve
    // straight from "dist" (dist/index.html, dist/assets/...). Replit's
    // artifact.toml separately expects "dist/public" — see the
    // "mirror-dist-public" postbuild script in package.json, which copies
    // this output into dist/public after every build so both platforms find
    // the same build from one build step.
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:  ["react", "react-dom"],
          router:  ["wouter"],
          query:   ["@tanstack/react-query"],
          charts:  ["lightweight-charts"],
          motion:  ["framer-motion"],
          ui: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
          ],
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: false,
    },
    watch: {
      ignored: [
        path.resolve(import.meta.dirname, "..", "..", "attached_assets") + "/**",
        "**/node_modules/**",
      ],
    },
    proxy: {
      "/node_modules/.pnpm/expo-router": {
        target: "http://localhost:23996",
        changeOrigin: true,
        ws: false,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
