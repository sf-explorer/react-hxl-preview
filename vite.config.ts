import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Config for the demo playground (`npm run dev`, `npm run build:demo`).
//
// The GitHub Pages deploy serves the demo from a PROJECT sub-path
// (https://sf-explorer.github.io/react-hxl-preview/), so the built asset URLs
// must be prefixed with that path. `base` is applied on build only — local
// `dev` keeps serving from `/` so the dev server URL stays clean. The demo
// build writes to `dist-demo/` so it never clobbers the library build (`dist/`).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/react-hxl-preview/" : "/",
  plugins: [react()],
  build: {
    outDir: "dist-demo",
  },
}))
