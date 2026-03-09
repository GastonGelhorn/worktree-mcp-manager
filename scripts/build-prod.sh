#!/bin/sh
set -e

# Ensure we are in the project root
cd "$(dirname "$0")/.."

echo "==> Building CLI binary (release)..."
cargo build --release -p worktree-cli

echo "==> Copying sidecar binary..."
ARCH=$(uname -m)
[ "$ARCH" = "arm64" ] && ARCH="aarch64"
cp target/release/worktree-cli "src-tauri/bin/worktree-cli-${ARCH}-apple-darwin"

echo "==> Bundling MCP server..."
cd mcp-server
npm run bundle

echo "==> Creating MCP executable wrapper..."
cat << 'EOF' > "../src-tauri/bin/mcp-server-aarch64-apple-darwin"
#!/usr/bin/env bash
# Quick wrapper to start the MCP Node server
DIR="$(cd "$(dirname "$0")" && pwd)"
# Auto-detect CLI binary next to this wrapper (inside .app bundle)
export WORKTREE_CLI_PATH="${WORKTREE_CLI_PATH:-$DIR/worktree-cli}"
exec node "$DIR/../Resources/_up_/mcp-server/dist/index.mjs" "$@"
EOF
chmod +x "../src-tauri/bin/mcp-server-aarch64-apple-darwin"

# Tauri needs the x86 wrapper as well
cp "../src-tauri/bin/mcp-server-aarch64-apple-darwin" "../src-tauri/bin/mcp-server-x86_64-apple-darwin"

cd ..

echo "==> Building frontend..."
tsc && vite build

echo "==> Done!"
