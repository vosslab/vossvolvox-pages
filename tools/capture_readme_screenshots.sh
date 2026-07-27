#!/usr/bin/env bash
# Rebuild and capture deterministic README screenshots from the shipped page.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SCREENSHOT_PORT="${SCREENSHOT_PORT:-4174}"
SCREENSHOT_TEMP_DIR="/tmp/vossvolvox_pages_screenshots"
SCREENSHOT_URL="http://127.0.0.1:${SCREENSHOT_PORT}/"
SCREENSHOT_REFERENCE_PDB="OTHER_REPOS/vossvolvox-rust/OTHER_REPOS/vossvolvox-cpp/xyzr/2LYZ.pdb"

cleanup_screenshot_server() {
	if [ -n "${SCREENSHOT_SERVER_PID:-}" ]; then
		kill "$SCREENSHOT_SERVER_PID" 2>/dev/null || true
		wait "$SCREENSHOT_SERVER_PID" 2>/dev/null || true
	fi
}
trap cleanup_screenshot_server EXIT

./build_github_pages.sh
(source source_me.sh && exec python3 -m http.server "$SCREENSHOT_PORT" --directory dist) &
SCREENSHOT_SERVER_PID=$!

for _attempt in {1..50}; do
	if curl --fail --silent --output /dev/null "$SCREENSHOT_URL"; then
		break
	fi
	sleep 0.1
done
curl --fail --silent --output /dev/null "$SCREENSHOT_URL"

if [ -f "$SCREENSHOT_REFERENCE_PDB" ]; then
	node tests/playwright/helper_capture_docs.mjs \
		"$SCREENSHOT_URL" "$SCREENSHOT_TEMP_DIR" "$SCREENSHOT_REFERENCE_PDB"
else
	echo "WARNING: 2LYZ reference fixture not found; capturing the small fallback PDB." >&2
	node tests/playwright/helper_capture_docs.mjs "$SCREENSHOT_URL" "$SCREENSHOT_TEMP_DIR"
fi
mkdir -p docs/screenshots
cp "$SCREENSHOT_TEMP_DIR/tool_selector.png" docs/screenshots/tool_selector.png
cp "$SCREENSHOT_TEMP_DIR/volume_setup.png" docs/screenshots/volume_setup.png
cp "$SCREENSHOT_TEMP_DIR/volume_results.png" docs/screenshots/volume_results.png

echo "Updated docs/screenshots/tool_selector.png, volume_setup.png, and volume_results.png."
echo "Captured light-mode visual QA at $SCREENSHOT_TEMP_DIR/volume_results_light.png."
