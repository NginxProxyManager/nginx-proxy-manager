#!/bin/bash

# Colors
BLUE='\E[1;34m'
CYAN='\E[1;36m'
GREEN='\E[1;32m'
RED='\E[1;31m'
RESET='\E[0m'
YELLOW='\E[1;33m'

export BLUE CYAN GREEN RED RESET YELLOW

# Docker Compose
COMPOSE_PROJECT_NAME="npmdev"
COMPOSE_FILE="docker/docker-compose.dev.yml"

export COMPOSE_FILE COMPOSE_PROJECT_NAME
