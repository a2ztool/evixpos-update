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
        // Smarter chunking: split heavy deps into their own chunks so
        // pages that don't need them (e.g. dashboard pages don't need
        // recharts/framer-motion) never download them.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/react-dom/") || id.match(/\/react\/[^/]+$/)) return "vendor-react";
          if (id.includes("react-router")) return "vendor-router";
          if (id.includes("@tanstack/")) return "vendor-query";
          if (id.includes("@supabase/")) return "vendor-supabase";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("@radix-ui/")) return "vendor-radix";
          if (id.includes("date-fns")) return "vendor-date";
          if (id.includes("zod") || id.includes("react-hook-form")) return "vendor-forms";
          return "vendor";
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
