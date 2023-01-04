#!/bin/bash -e

go test -json -cover ./internal/... | tparse
