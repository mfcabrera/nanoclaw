#!/bin/bash
# Build the NanoClaw agent container with PlatoML tools
#
# Prerequisites: nanoclaw-agent:latest must be built first (run build.sh)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="nanoclaw-agent-platoml"
TAG="${1:-latest}"

# Verify base image exists
if ! docker image inspect nanoclaw-agent:latest >/dev/null 2>&1; then
  echo "Base image nanoclaw-agent:latest not found. Building it first..."
  bash build.sh
fi

echo "Building PlatoML agent container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"

docker build -f Dockerfile.platoml -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "To use with a group, set containerImage in the group's containerConfig:"
echo '  { "containerImage": "nanoclaw-agent-platoml:latest" }'
