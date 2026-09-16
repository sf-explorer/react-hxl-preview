import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Config for the demo playground (`npm run dev`, `npm run build:demo`).
//
// `base: "./"` on build emits RELATIVE asset URLs (`./assets/…`) instead of
// path-absolute ones. That's what lets the same build run from any mount point:
// the GitHub Pages project sub-path (https://sf-explorer.github.io/react-hxl-preview/)
// AND an arbitrary tile path on the Page Host, since relative URLs resolve
// against wherever index.html actually lives. Local `dev` still serves from `/`.
// The demo build writes to `dist-demo/` so it never clobbers the library build
// (`dist/`).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  plugins: [react()],
  build: {
    outDir: "dist-demo",
  },
}))
