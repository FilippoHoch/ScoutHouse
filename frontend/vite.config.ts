import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(() => {
  const plugins = [react()];

  if (process.env.ANALYZE === "true") {
    plugins.push(
      visualizer({
        filename: "dist/analyze/stats.json",
        gzipSize: true,
        brotliSize: true,
        json: true,
        template: "sunburst"
      })
    );
  }

  return {
    plugins,
    server: {
      host: "0.0.0.0",
      port: 5173
    },
    preview: {
      host: "0.0.0.0",
      port: 4173
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/setupTests.ts",
      include: ["src/**/*.{test,spec}.{js,ts,tsx}", "__tests__/**/*.{test,spec}.{js,ts,tsx}"]
    }
  };
});
