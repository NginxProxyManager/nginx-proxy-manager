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

# Capture whether IPv6 was disabled globally by 50-ipv6.sh before we overwrite default.conf
IPV6_DISABLED=0
if grep -q "#listen \[::\]" /etc/nginx/conf.d/default.conf; then
    IPV6_DISABLED=1
fi

# Upstream compilation guard & Operator kill-switch:
# If Nginx lacks HTTP/3 capabilities OR if NPM_HTTP3_DISABLED=1,
# strip the `quic` listen lines from the default.conf server blocks
# to prevent startup failures or unwanted port bindings.
# We defensively cache and restore the original default.conf to ensure
# dynamic toggles work reliably across container restarts without rebuilds.
if [ ! -f /etc/nginx/conf.d/default.conf.orig ]; then
    cp /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.orig
fi
cp /etc/nginx/conf.d/default.conf.orig /etc/nginx/conf.d/default.conf

# Strip QUIC sockets from default.conf if unsupported or globally disabled
if ! nginx -V 2>&1 | grep -q -- "--with-http_v3_module" || [ "${NPM_HTTP3_DISABLED}" = "1" ]; then
    echo "ℹ️  HTTP/3: Stripping QUIC sockets from default.conf (unsupported or globally disabled)"
    sed -i '/quic/d' /etc/nginx/conf.d/default.conf
    
    # Cascade sanitization down to static configuration directory blocks
    if [ -d /data/nginx/proxy_host ]; then
        echo "ℹ️  HTTP/3: Mass-sanitizing existing proxy host configurations to prevent boot crashes"
        find /data/nginx/proxy_host -name "*.conf" -type f -exec sed -i '/quic/d' {} +
    fi
fi

# If IPv6 was disabled globally, ensure IPv6 sockets (including QUIC ones if still active) remain commented out in default.conf
if [ "${IPV6_DISABLED}" = "1" ] || [ "$(is_true "${DISABLE_IPV6:-}")" = '1' ]; then
    echo "ℹ️  IPv6 is disabled globally. Deactivating IPv6 sockets in default.conf..."
    sed -i 's/^[^#]*listen \[::\]/#listen [::]/g' /etc/nginx/conf.d/default.conf
fi
