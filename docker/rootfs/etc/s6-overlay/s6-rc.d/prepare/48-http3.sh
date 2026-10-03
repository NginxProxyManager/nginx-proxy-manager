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
# strip the `quic` listen lines from default.conf and proxy hosts
# to prevent startup failures or unwanted port bindings.
# We defensively cache and restore the original default.conf before 50-ipv6.sh runs
# to ensure dynamic toggles work reliably across container restarts without rebuilds.
if [ ! -f /etc/nginx/conf.d/default.conf.orig ]; then
    cp /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.orig
fi
cp /etc/nginx/conf.d/default.conf.orig /etc/nginx/conf.d/default.conf

# Strip QUIC sockets and disable global HTTP/3 directives if unsupported or globally disabled
if ! nginx -V 2>&1 | grep -q -- "--with-http_v3_module" || [ "${NPM_HTTP3_DISABLED}" = "1" ]; then
    echo "ℹ️  HTTP/3: Stripping QUIC sockets from default.conf (unsupported or globally disabled)"
    rm -f /etc/nginx/conf.d/include/http3.conf
    sed -i \
        -e '/^[[:space:]]*listen[[:space:]].*quic/d' \
        -e '/^[[:space:]]*quic_/d' \
        -e '/^[[:space:]]*http3/d' \
        -e '/Alt-Svc.*h3=/d' /etc/nginx/conf.d/default.conf

    # Cascade sanitization down to static configuration directory blocks using strictly anchored patterns
    if [ -d /data/nginx/proxy_host ]; then
        echo "ℹ️  HTTP/3: Mass-sanitizing existing proxy host configurations to prevent boot crashes"
        find /data/nginx/proxy_host -name "*.conf" -type f -exec sed -i \
            -e '/^[[:space:]]*listen[[:space:]].*quic/d' \
            -e '/^[[:space:]]*quic_/d' \
            -e '/^[[:space:]]*http3/d' \
            -e '/Alt-Svc.*h3=/d' {} +
    fi
else
    # Ensure global HTTP/3 configuration is present
    if [ ! -f /etc/nginx/conf.d/include/http3.conf ]; then
        echo "http3_stream_buffer_size 64k;" > /etc/nginx/conf.d/include/http3.conf
    fi
fi
