#!/bin/bash
set -eufo pipefail

export RED='\E[1;31m'
export YELLOW='\E[1;33m'
export RESET='\033[0m'

PROJECT_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$PROJECT_DIR"

trap cleanup EXIT
cleanup() {
	if [ "$?" -ne 0 ]; then
		echo -e "${RED}LINTING FAILED${RESET}"
	fi
}

if ! command -v golangci-lint &>/dev/null; then
	echo -e "${YELLOW}Installing golangci-lint ...${RESET}"
	go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest
fi

echo -e "${YELLOW}golangci-lint ...${RESET}"
golangci-lint --max-same-issues=0 --max-issues-per-linter=0 run ./...

if ! command -v modernize &>/dev/null; then
	echo -e "${YELLOW}Installing modernize ...${RESET}"
	go install golang.org/x/tools/gopls/internal/analysis/modernize/cmd/modernize@latest
fi

echo -e "${YELLOW}modernize ...${RESET}"
modernize -test "$@" ./...
