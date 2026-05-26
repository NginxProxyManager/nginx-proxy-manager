#!/usr/bin/env bash
# HTTP/3 (QUIC) Pre-flight: UDP Receive Buffer Diagnostic
#
# QUIC is sensitive to kernel UDP socket buffer limits. If the host's rmem_max
# is too low, incoming QUIC stream packets will be silently dropped, causing
# connection failures and degraded performance.
#
# Recommended host-level fix (run as root on the Docker host, not inside the container):
#   sysctl -w net.core.rmem_max=25165824
#   sysctl -w net.core.wmem_max=25165824
#
# To make the change persistent across reboots, add to /etc/sysctl.conf:
#   net.core.rmem_max=25165824
#   net.core.wmem_max=25165824

RMEM_LIMIT=$(cat /proc/sys/net/core/rmem_max 2>/dev/null || echo 0)
RECOMMENDED_BUFFER=25165824

if [ "${RMEM_LIMIT}" -lt "${RECOMMENDED_BUFFER}" ]; then
    echo "⚠️  WARNING: Host Linux kernel UDP receive buffer (rmem_max=${RMEM_LIMIT}) is below the"
    echo "⚠️  recommended minimum of ${RECOMMENDED_BUFFER} bytes (24 MiB) for HTTP/3 (QUIC)."
    echo "⚠️  Packet drops may occur under sustained QUIC load."
    echo "⚠️  Recommended fix on the Docker host (not inside the container):"
    echo "⚠️    sysctl -w net.core.rmem_max=${RECOMMENDED_BUFFER}"
    echo "⚠️    sysctl -w net.core.wmem_max=${RECOMMENDED_BUFFER}"
else
    echo "✅ SUCCESS: Host Linux kernel UDP receive buffer (rmem_max=${RMEM_LIMIT}) satisfies"
    echo "✅ the recommended minimum of ${RECOMMENDED_BUFFER} bytes for HTTP/3 (QUIC)."
fi
