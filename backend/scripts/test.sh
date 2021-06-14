#!/bin/bash -e

export RICHGO_FORCE_COLOR=1

richgo test -bench=. -cover -v ./internal/...
