#!/bin/bash -e

BLUE='\E[1;34m'
CYAN='\E[1;36m'
YELLOW='\E[1;33m'
GREEN='\E[1;32m'
RED='\E[1;31m'
RESET='\E[0m'

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${DIR}"
export DOCKER_IMAGE=baudneo/nginx-proxy-manager
export MAINTAINER="baudneo <baudneo@protonmail.com>"
export REPO_OWNER="baudneo"
export BASE_TAG='local_upgrade'

export TARGETPLATFORM=amd64
export BUILD_VERSION=dev
export BUILD_COMMIT=
export BUILD_DATE="$(date '+%Y-%m-%d %T %Z')"
export SSL_CERTS_PATH="/etc/ssl/certs/GTS_Root_R1.pem"
echo -e "${BLUE}❯ ${CYAN}Running ${RED}'scripts/frontend-build'${RESET}"
bash ./scripts/frontend-build
# Build
echo -e "${BLUE}❯ ${CYAN}Building Image [${DOCKER_IMAGE}] with tag: ${YELLOW}${BASE_TAG}${CYAN}...${RESET}"
docker build \
        \
        --build-arg BUILD_VERSION="${BUILD_VERSION:-dev}" \
        --build-arg BUILD_COMMIT="${BUILD_COMMIT:-notset}" \
        --build-arg BUILD_DATE="${BUILD_DATE}" \
        --build-arg SSL_CERTS_PATH="${SSL_CERTS_PATH}" \
        --build-arg BASE_TAG="${BASE_TAG}" \
        -t ${DOCKER_IMAGE}:${BASE_TAG} \
        -f docker/Dockerfile \
        .

echo -e "${BLUE}❯ ${GREEN}All done!${RESET}"

