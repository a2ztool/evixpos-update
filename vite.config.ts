import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// Inject build id into /sw.js so each production build produces a
// byte-different service worker. Browsers only re-check & install a
// new SW when /sw.js bytes change — without this, deploys may not
// reach already-installed PWAs.
function stampServiceWorker() {
  return {
    name: "stamp-sw-build-id",
    apply: "build" as const,
    closeBundle() {
      const buildId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const swPath = path.resolve(__dirname, "dist/sw.js");
      try {
        const src = fs.readFileSync(swPath, "utf8");
        const stamped = `// BUILD_ID=${buildId}\n` + src;
        fs.writeFileSync(swPath, stamped);
      } catch {
        // sw.js may not exist in some builds — non-fatal
      }
    },
  };
}

// https://vitejs.dev/config/
// NOTE: We deliberately do NOT use vite-plugin-pwa.
// Its Workbox-generated SW caches HTML aggressively, which causes
// installed PWAs to show stale UI after deploys. Instead, we use a
// hand-written push-only service worker at /public/sw.js that does
// NOT cache HTML — Vite already hashes JS/CSS so they're cache-safe,
// and HTML is fetched fresh on every load.
export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_TIME__: JSON.stringify(Date.now().toString()),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "production" && stampServiceWorker(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // Split only heavy, leaf-style deps that don't depend on React's
        // module shape. Bundling React/Radix/Router/Query separately can
        // create init-order bugs in prod (e.g. React undefined when Radix
        // calls forwardRef) — let Rollup handle those automatically.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("date-fns")) return "vendor-date";
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "@supabase/supabase-js",
    ],
  },
}));
