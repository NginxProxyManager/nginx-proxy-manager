#!/usr/bin/with-contenv bash
# HTTP/3 (QUIC) Pre-flight: UDP Receive Buffer Diagnostic & Capabilities Guard
#
# QUIC is sensitive to kernel UDP socket buffer limits. If the host's rmem_max
# is too low, incoming QUIC stream packets will be silently dropped.
#
# Recommended host-level fix (run as root on the Docker host, not inside the container):
#   sysctl -w net.core.rmem_max=25165824
#   sysctl -w net.core.wmem_max=25165824

RMEM_LIMIT=$(cat /proc/sys/net/core/rmem_max 2>/dev/null || echo 0)
RECOMMENDED_BUFFER=25165824

if [ "${RMEM_LIMIT}" -lt "${RECOMMENDED_BUFFER}" ] && [ "${RMEM_LIMIT}" -ne 0 ]; then
    echo "⚠️  WARNING: Host Linux kernel UDP receive buffer (rmem_max=${RMEM_LIMIT}) is below the"
    echo "⚠️  recommended minimum of ${RECOMMENDED_BUFFER} bytes (24 MiB) for HTTP/3 (QUIC)."
    echo "⚠️  Packet drops may occur under sustained QUIC load."
    echo "⚠️  Recommended fix on the Docker host (not inside the container):"
    echo "⚠️    sysctl -w net.core.rmem_max=${RECOMMENDED_BUFFER}"
    echo "⚠️    sysctl -w net.core.wmem_max=${RECOMMENDED_BUFFER}"
fi

# Upstream compilation guard & Operator kill-switch:
# If Nginx lacks HTTP/3 capabilities OR if NPM_HTTP3_DISABLED=1,
# strip the `quic` listen lines from the default.conf server blocks
# to prevent startup failures or unwanted port bindings.
if ! nginx -V 2>&1 | grep -q -- "--with-http_v3_module" || [ "${NPM_HTTP3_DISABLED}" = "1" ]; then
    echo "ℹ️  HTTP/3: Stripping QUIC sockets from default.conf (unsupported or globally disabled)"
    sed -i '/quic/d' /etc/nginx/conf.d/default.conf
fi
