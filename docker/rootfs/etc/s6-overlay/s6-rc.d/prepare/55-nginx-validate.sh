#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Checking nginx config ssl certificate files ...'

# Scan all nginx host config files for ssl_certificate directives
# and rename configs that reference missing certificate files to *.err.
# This prevents nginx from refusing to start when a certificate
# has been deleted or its files are gone from disk (eg. after a
# volume re-creation or manual cert deletion).

for conf_file in \
	/data/nginx/proxy_host/*.conf \
	/data/nginx/redirection_host/*.conf \
	/data/nginx/stream/*.conf \
	/data/nginx/dead_host/*.conf; do
	[ -f "$conf_file" ] || continue

	# Extract ssl_certificate paths. The pattern anchors on leading whitespace and
	# requires a space after the keyword, which naturally excludes ssl_certificate_key.
	while IFS= read -r cert_path; do
		[ -n "$cert_path" ] || continue
		if [ ! -f "$cert_path" ]; then
			log_error "Missing certificate file: $cert_path"
			log_error "Disabling broken nginx config: $conf_file"
			mv "$conf_file" "${conf_file}.err"
			break
		fi
	done < <(grep -E '^[[:space:]]+ssl_certificate[[:space:]]' "$conf_file" 2>/dev/null | awk '{sub(/;.*$/, ""); print $NF}' || true)
done
