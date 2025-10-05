#!/bin/sh

# This script runs every time the container starts.

# Inject the load_module directives into the main nginx.conf.
# This ensures our changes are present even if the file is regenerated on startup.
sed -i '1iload_module /etc/nginx/modules/ngx_http_brotli_filter_module.so;\nload_module /etc/nginx/modules/ngx_http_brotli_static_module.so;\n' /etc/nginx/nginx.conf

# Now, execute the original entrypoint of the Nginx Proxy Manager
exec /init
