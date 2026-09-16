#!/usr/bin/env node
// Fold a Vite multi-file build (index.html + ./assets/*.js + ./assets/*.css)
// into ONE self-contained HTML file, as the Page Host single-file route wants
// (all CSS/JS inline, no local <link>/<script src>). See the host's
// 01-BUILD-SINGLE-FILE.md. Zero dependencies.
//
// Usage: node deploy/inline-html.mjs <in.html> <out.html>

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) {
  console.error("usage: inline-html.mjs <in.html> <out.html>")
  process.exit(1)
}

const baseDir = dirname(inPath)
let html = readFileSync(inPath, "utf8")

const read = (url) => readFileSync(resolve(baseDir, url.replace(/^\.?\//, "")), "utf8")
// A literal </script> inside the bundled JS would close our inline <script>
// early. Neutralise it — harmless inside JS/strings, fatal in the DOM otherwise.
const guard = (js) => js.replace(/<\/script>/gi, "<\\/script>")

// Inline <script ... src="..."></script>
html = html.replace(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>\s*<\/script>/g, (_m, pre, src, post) => {
  const isModule = /type="module"/.test(pre + post)
  return `<script${isModule ? ' type="module"' : ""}>\n${guard(read(src))}\n</script>`
})

// Inline <link rel="stylesheet" ...> and drop preload/modulepreload hints
// (their targets are now inline, so the browser would 404 them).
html = html.replace(/<link\b[^>]*>/g, (tag) => {
  if (/rel="stylesheet"/.test(tag)) {
    const href = /href="([^"]+)"/.exec(tag)?.[1]
    if (href) return `<style>\n${read(href)}\n</style>`
  }
  if (/rel="(?:modulepreload|preload|prefetch)"/.test(tag)) return ""
  return tag
})

// Sanity: nothing local should still be referenced.
const leftover = html.match(/(?:src|href)="\.?\/assets\/[^"]+"/g)
if (leftover) {
  console.error("inline-html: unresolved local references remain:\n  " + leftover.join("\n  "))
  process.exit(1)
}

writeFileSync(outPath, html)
const kb = (Buffer.byteLength(html) / 1024).toFixed(1)
console.log(`inline-html: wrote ${outPath} (${kb} KB)`)
