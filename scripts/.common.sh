#!/bin/bash

# Colors
BLUE='\E[1;34m'
CYAN='\E[1;36m'
GREEN='\E[1;32m'
RED='\E[1;31m'
RESET='\E[0m'
YELLOW='\E[1;33m'

export BLUE CYAN GREEN RED RESET YELLOW

# Identify docker-like command
# Ensure docker exists
if command -v docker 1>/dev/null 2>&1; then
  export docker=docker
elif command -v podman 1>/dev/null 2>&1; then
  export docker=podman
else
  echo -e "${RED}❯ docker or podman command is not available${RESET}"
  exit 1
fi

# Docker Compose
COMPOSE_PROJECT_NAME="npm2dev"
COMPOSE_FILE="docker/docker-compose.dev.yml"

export COMPOSE_FILE COMPOSE_PROJECT_NAME

# $1: container_name
get_container_ip () {
	local container_name=$1
	local container
	local ip
	container=$(docker compose ps --all -q "${container_name}" | tail -n1)
	ip=$(docker inspect --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$container")
	echo "$ip"
}
