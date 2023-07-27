#!/bin/bash -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

go test -json -cover -coverprofile="$DIR/../coverage.out" ./internal/... | tparse
go tool cover -html="$DIR/../coverage.out" -o "$DIR/../coverage.html"
rm -f "$DIR/../coverage.out"
