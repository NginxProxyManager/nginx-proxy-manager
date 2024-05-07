#!/bin/bash
set -eu

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v go-test-coverage &>/dev/null; then
	go install github.com/vladopajic/go-test-coverage/v2@latest
fi
if ! command -v tparse &>/dev/null; then
	go install github.com/mfridman/tparse@latest
fi

rm -f "$DIR/coverage.html"

trap cleanup EXIT
cleanup() {
	rm -f "$DIR/coverage.out"
}

echo "Running go test suite ..."
go test -json -cover ./... -coverprofile="$DIR/coverage.out" | tparse
go tool cover -html="$DIR/coverage.out" -o "$DIR/coverage.html"
go-test-coverage -c "$DIR/.testcoverage.yml"
