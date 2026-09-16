#!/usr/bin/env bash
# Deploy the demo to the Page Host as a single self-contained HTML tile.
#
# Builds → inlines to one HTML file → size-checks → uploads. If UPLOAD_ID is set
# it pushes a NEW VERSION of that tile (id/url/votes/access preserved); otherwise
# it CREATES a new tile and prints the assigned id.
#
# Auth: a Page Host management token with `write` scope (from vibewareauth).
#
# Required:
#   VWT_TOKEN     the vwt_... bearer token
# Optional:
#   UPLOAD_ID     tile id to version (default: 14829). Empty string => create new.
#   HOST          base URL (default: the demo host)
#   VERSION_KIND  patch | minor | major (default: minor — works on 2- and 3-seg)
#   VERSION       explicit version (e.g. 2.5); overrides VERSION_KIND when set
#   TITLE / DESCRIPTION / TAGS   metadata, used on CREATE (tags comma-separated)
#
# Examples:
#   VWT_TOKEN=vwt_xxx ./deploy/deploy-host.sh                 # version-bump 14829
#   VWT_TOKEN=vwt_xxx VERSION_KIND=major ./deploy/deploy-host.sh
#   VWT_TOKEN=vwt_xxx UPLOAD_ID= TITLE="HXL Viewer" ./deploy/deploy-host.sh  # new tile
set -euo pipefail

HOST="${HOST:-https://single-html-page-app-host-07cda8a7041b.herokuapp.com}"
UPLOAD_ID="${UPLOAD_ID-14829}"
VERSION_KIND="${VERSION_KIND:-minor}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist-demo/tile.html"

if [[ -z "${VWT_TOKEN:-}" ]]; then
  echo "error: VWT_TOKEN is required (Page Host management token, 'write' scope)." >&2
  exit 1
fi

echo "==> Building demo"
npm --prefix "$ROOT" run build:demo >/dev/null

echo "==> Inlining to a single HTML file"
node "$ROOT/deploy/inline-html.mjs" "$ROOT/dist-demo/index.html" "$OUT"

# Single-file route caps at ~500 KB; hard host limit is 50 MB.
BYTES=$(wc -c < "$OUT")
if (( BYTES > 500 * 1024 )); then
  echo "warning: $OUT is $((BYTES / 1024)) KB (>500 KB). Consider the zip-bundle route (/api/uploads/bundle)." >&2
fi

auth=(-H "Authorization: Bearer ${VWT_TOKEN}")

if [[ -n "$UPLOAD_ID" ]]; then
  echo "==> Pushing new version of tile ${UPLOAD_ID} (${VERSION:+version=$VERSION}${VERSION:-kind=$VERSION_KIND})"
  if [[ -n "${VERSION:-}" ]]; then
    ver_field=(-F "version=${VERSION}")
  else
    ver_field=(-F "kind=${VERSION_KIND}")
  fi
  curl -fsS -X POST "${HOST}/api/uploads/${UPLOAD_ID}/version" \
    "${auth[@]}" \
    -F "file=@${OUT};type=text/html" \
    "${ver_field[@]}"
else
  echo "==> Creating a new tile"
  curl -fsS -X POST "${HOST}/api/uploads" \
    "${auth[@]}" \
    -F "file=@${OUT};type=text/html" \
    -F "title=${TITLE:-React HXL Viewer}" \
    -F "description=${DESCRIPTION:-HXL widget viewer with AI editing}" \
    -F "tags=${TAGS:-hxl,widgets,ai}"
fi

echo   # newline after the JSON response
echo "==> Done"
