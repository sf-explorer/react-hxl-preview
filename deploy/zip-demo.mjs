#!/usr/bin/env node
// Post-build for the demo site: bundle the multi-file build (dist-demo/) into
// dist-demo.zip for the Page Host zip-bundle upload route
// (POST /api/uploads/bundle). index.html sits at the ARCHIVE ROOT, with assets/
// beside it, so the host resolves relative URLs correctly.
//
// Runs automatically after `npm run build:demo` (npm post-hook). Uses the `zip`
// CLI, which ships on macOS and the GitHub ubuntu runners.

import { execFileSync } from "node:child_process"
import { existsSync, rmSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const dir = resolve(root, "dist-demo")
const out = resolve(root, "dist-demo.zip")

if (!existsSync(resolve(dir, "index.html"))) {
  console.error("zip-demo: dist-demo/index.html not found — run the demo build first.")
  process.exit(1)
}

try {
  execFileSync("zip", ["--version"], { stdio: "ignore" })
} catch {
  // The zip is an optional host-bundle artifact; the GitHub Pages deploy only
  // needs dist-demo/. Don't fail the build (which runs this as a post-hook)
  // just because `zip` is missing — warn and skip.
  console.warn("zip-demo: `zip` CLI not available — skipping dist-demo.zip.")
  process.exit(0)
}

rmSync(out, { force: true })
// Zip the CONTENTS of dist-demo (cwd = dir) so paths are relative to the root.
// Exclude the single-file variant and any stray archive/OS cruft.
execFileSync("zip", ["-r", "-q", out, ".", "-x", "tile.html", "*.zip", "*.DS_Store"], {
  cwd: dir,
})

const kb = (statSync(out).size / 1024).toFixed(1)
console.log(`zip-demo: wrote ${out} (${kb} KB)`)
