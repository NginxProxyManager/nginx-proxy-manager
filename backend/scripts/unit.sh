#!/bin/bash
set -eu

export RED='\E[1;31m'
export YELLOW='\E[1;33m'
export RESET='\033[0m'

cd -- "$(dirname -- "$0")/.." || exit 1

if ! command -v go-test-coverage &>/dev/null; then
	echo -e "${YELLOW}Installing go-test-coverage ...${RESET}"
	go install github.com/vladopajic/go-test-coverage/v2@latest
fi

if ! command -v tparse &>/dev/null; then
	echo -e "${YELLOW}Installing tparse ...${RESET}"
	go install github.com/mfridman/tparse@latest
fi

if ! command -v go-junit-report &>/dev/null; then
	echo -e "${YELLOW}Installing go-junit-report ...${RESET}"
	go install github.com/jstemmer/go-junit-report/v2@latest
fi

trap cleanup EXIT
cleanup() {
	if [ "$?" -ne 0 ]; then
		echo -e "${RED}UNIT TESTING FAILED - check output and consider minimum coverage requirements${RESET}"
	fi
	rm -f coverage.out
}

mkdir -p ../test/results/html-reports ../test/results/junit
go test -json -cover -coverprofile="./coverage.out" ./... | tparse || true
go tool cover -html="./coverage.out" -o "../test/results/html-reports/backend-coverage.html"
go test -v -covermode=atomic ./... 2>&1 | go-junit-report >../test/results/junit/backend.xml

# this enforces minimum coverage requirements
go-test-coverage -c .testcoverage.yml
