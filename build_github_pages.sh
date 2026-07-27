#!/usr/bin/env bash
# build_github_pages.sh - canonical production build for GitHub Pages.
#
# Front door: run this directly as ./build_github_pages.sh. It is the
# interface for everyone, no npm knowledge required. The npm run build
# alias is an optional mirror that points right back at this script.
#
# Contract:
#   - Wipes dist/ from scratch.
#   - Type-checks via 'tsc --noEmit -p tsconfig.json'.
#   - Requires src/main.ts as the browser entry point.
#   - Verifies src/index.html and src/style.css exist before copying;
#     aborts with an actionable error if missing.
#   - Verifies src/index.html references dist/main.js with a module script
#     tag (warns if missing -- the page will load but main.js is dead).
#   - Builds the single-threaded Rust core for wasm32-unknown-unknown.
#   - Bundles the page and Web Worker into dist/ with esbuild (ESM,
#     es2020, browser, minified, with sourcemaps).
#   - Copies the WebAssembly module into dist/.
#   - Copies src/index.html, src/style.css, and the original tool images into dist/.
#   - Writes dist/.nojekyll so GitHub Pages serves files starting with _.
#   - Asserts dist/index.html and dist/main.js exist before exiting.
#
# Hard rule: never produces single-file output. ESM only.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Verify the fixed entry point before any destructive step.
if [ ! -f "src/main.ts" ]; then
	echo "ERROR: browser entry point missing: src/main.ts" >&2
	exit 1
fi

# Verify required static assets before any destructive step.
for required in \
	src/index.html \
	src/style.css \
	src/img/volumeCalc.png \
	src/img/volumeRange.png \
	src/img/channelFinder.png \
	src/img/channelExtract.png \
	src/img/solventExtract.png \
	src/img/tunnelExtract.png; do
	if [ ! -f "$required" ]; then
		echo "ERROR: required source file missing: $required" >&2
		case "$required" in
			src/index.html)
				echo "  Create src/index.html with a <script type=\"module\" src=\"main.js\"></script> tag." >&2 ;;
			src/style.css)
				echo "  Create src/style.css (empty file is fine)." >&2 ;;
		esac
		exit 1
	fi
done

# Soft-warn if index.html does not reference main.js as an ES module.
if ! grep -Eq '<script[^>]+type="module"[^>]+src="(\./)?main\.js"' src/index.html; then
	echo "WARNING: src/index.html does not appear to load main.js as an ES module." >&2
	echo "  Expected tag: <script type=\"module\" src=\"main.js\"></script>" >&2
	echo "  Build will proceed; the page may render but main.js will not run." >&2
fi

if ! command -v cargo >/dev/null 2>&1; then
	echo "ERROR: cargo not found. Install Rust before building the WASM engine." >&2
	exit 1
fi

if ! rustup target list --installed | grep -qx 'wasm32-unknown-unknown'; then
	echo "ERROR: Rust target wasm32-unknown-unknown is not installed." >&2
	echo "  Run: rustup target add wasm32-unknown-unknown" >&2
	exit 1
fi

rm -rf dist
mkdir -p dist

cargo build \
	--manifest-path wasm/Cargo.toml \
	--target wasm32-unknown-unknown \
	--release \
	--locked

npx tsc --noEmit -p tsconfig.json

npx esbuild src/main.ts src/volume_worker.ts \
	--bundle \
	--format=esm \
	--target=es2020 \
	--platform=browser \
	--minify \
	--sourcemap \
	--outdir=dist

cp src/index.html dist/index.html
cp src/style.css dist/style.css
cp -R src/img dist/img
cp wasm/target/wasm32-unknown-unknown/release/vossvolvox_wasm.wasm \
	dist/vossvolvox_wasm.wasm
touch dist/.nojekyll

test -f dist/index.html
test -f dist/main.js
test -f dist/volume_worker.js
test -f dist/vossvolvox_wasm.wasm

echo "Built dist/ (GitHub Pages-ready)."
