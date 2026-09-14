import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Config for the demo playground (`npm run dev`).
export default defineConfig({
  plugins: [react()],
})
