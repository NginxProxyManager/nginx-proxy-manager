#!/bin/bash -e
# Build VitePress documentation (openapi bundle + static site).

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${DIR}/.." && pwd)"

cd "${ROOT}/docs"
if [ -f package-lock.json ]; then
	npm ci
else
	npm install
fi
npm run build
echo "Docs built to ${ROOT}/docs/dist"
