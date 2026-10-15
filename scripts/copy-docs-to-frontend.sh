#!/bin/bash -e
# Copy VitePress build output into frontend/dist/docs for bundling in the admin UI.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${DIR}/.." && pwd)"
DOCS_DIST="${ROOT}/docs/dist"
FRONTEND_DOCS="${ROOT}/frontend/dist/docs"

if [ ! -d "${DOCS_DIST}" ]; then
	echo "docs/dist not found. Run: cd docs && npm install && npm run build" >&2
	exit 1
fi

if [ ! -d "${ROOT}/frontend/dist" ]; then
	echo "frontend/dist not found. Build the frontend first." >&2
	exit 1
fi

rm -rf "${FRONTEND_DOCS}"
mkdir -p "${FRONTEND_DOCS}"
cp -a "${DOCS_DIST}/." "${FRONTEND_DOCS}/"
echo "Copied docs to ${FRONTEND_DOCS}"
