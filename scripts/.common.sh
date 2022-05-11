#!/bin/bash

# Colors
BLUE='\033[1;34m'
CYAN='\033[1;36m'
GREEN='\033[1;32m'
RED='\033[1;31m'
RESET='\033[0m'
YELLOW='\033[1;33m'

export BLUE CYAN GREEN RED RESET YELLOW

# Docker Compose
COMPOSE_PROJECT_NAME="npmdev"
COMPOSE_FILE="docker/docker-compose.dev.yml"

export COMPOSE_FILE COMPOSE_PROJECT_NAME
