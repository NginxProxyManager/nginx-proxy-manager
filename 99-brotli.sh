#!/bin/sh
# s6-overlay startup script

echo "[custom-init] Injecting Brotli modules..."
sed -i '1iload_module /etc/nginx/modules/ngx_http_brotli_filter_module.so;\nload_module /etc/nginx/modules/ngx_http_brotli_static_module.so;\n' /etc/nginx/nginx.conf
echo "[custom-init] Brotli injection complete."
