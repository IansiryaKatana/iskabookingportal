import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks - split large libraries
          if (id.includes("node_modules")) {
            // React core - keep in main bundle for synchronous access
            // Don't split React/ReactDOM as they need to be available immediately
            if (id.includes("react") || id.includes("react-dom")) {
              return undefined; // Keep in main bundle
            }
            // React Router can be split
            if (id.includes("react-router")) {
              return "react-router";
            }
            // UI libraries (Radix UI)
            if (id.includes("@radix-ui")) {
              return "radix-ui";
            }
            // Data fetching
            if (id.includes("@tanstack/react-query")) {
              return "react-query";
            }
            // Supabase
            if (id.includes("@supabase")) {
              return "supabase";
            }
            // Stripe
            if (id.includes("@stripe")) {
              return "stripe";
            }
            // PDF/Image libraries
            if (id.includes("jspdf") || id.includes("html2canvas")) {
              return "pdf-utils";
            }
            // Form libraries
            if (id.includes("react-hook-form") || id.includes("zod") || id.includes("@hookform")) {
              return "forms";
            }
            // Date libraries
            if (id.includes("date-fns")) {
              return "date-utils";
            }
            // Other large vendor libraries
            if (id.includes("lucide-react") || id.includes("react-icons")) {
              return "icons";
            }
            // Default vendor chunk for other node_modules
            return "vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000, // Increase limit to 1MB to reduce warnings for reasonable chunks
  },
}));
