import { resolve } from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import dts from "vite-plugin-dts"

// Config for the distributable library build (`npm run build`).
export default defineConfig({
  plugins: [
    react(),
    dts({ include: ["src/lib"], rollupTypes: true }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/lib/index.ts"),
      name: "ReactHxlViewer",
      fileName: "react-hxl-viewer",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
        assetFileNames: "styles.css",
      },
    },
  },
})
