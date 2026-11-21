#!/command/with-contenv bash
# shellcheck shell=bash

set -e

. /usr/bin/common.sh

config_path=/etc/crowdsec/bouncers/crowdsec-openresty-bouncer.conf
config_dir=${config_path%/*}
mkdir -p "$config_dir"

config_value() {
	local name=$1 default=$2 value
	value=$(printenv "CROWDSEC_${name}" 2>/dev/null || true)
	printf '%s' "${value:-$default}"
}

require_no_newline() {
	local name=$1 value=$2
	if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
		log_fatal "CROWDSEC_${name} must not contain a newline."
	fi
}

require_boolean() {
	local name=$1 value=$2
	case "$value" in
		true|false) ;;
		*) log_fatal "CROWDSEC_${name} must be true or false." ;;
	esac
}

require_integer() {
	local name=$1 value=$2
	if ! [[ "$value" =~ ^[0-9]+$ ]]; then
		log_fatal "CROWDSEC_${name} must be a non-negative integer."
	fi
}

require_one_of() {
	local name=$1 value=$2
	shift 2
	local allowed
	for allowed in "$@"; do
		[ "$value" = "$allowed" ] && return
	done
	log_fatal "CROWDSEC_${name} has an unsupported value."
}

enabled=$(config_value ENABLED false)
api_url=$(config_value API_URL '')
api_key=$(config_value API_KEY '')
use_tls_auth=$(config_value USE_TLS_AUTH false)
tls_client_cert=$(config_value TLS_CLIENT_CERT /path/to/client.crt)
tls_client_key=$(config_value TLS_CLIENT_KEY /path/to/client.key)
cache_expiration=$(config_value CACHE_EXPIRATION 1)
bouncing_on_type=$(config_value BOUNCING_ON_TYPE all)
fallback_remediation=$(config_value FALLBACK_REMEDIATION ban)
request_timeout=$(config_value REQUEST_TIMEOUT 3000)
update_frequency=$(config_value UPDATE_FREQUENCY 10)
enable_internal=$(config_value ENABLE_INTERNAL false)
mode=$(config_value MODE live)
scenarios_containing=$(config_value SCENARIOS_CONTAINING '')
scenarios_not_containing=$(config_value SCENARIOS_NOT_CONTAINING '')
exclude_location=$(config_value EXCLUDE_LOCATION '')
ban_template_path=$(config_value BAN_TEMPLATE_PATH /var/lib/crowdsec/lua/templates/ban.html)
redirect_location=$(config_value REDIRECT_LOCATION '')
ret_code=$(config_value RET_CODE '')
captcha_provider=$(config_value CAPTCHA_PROVIDER '')
secret_key=$(config_value SECRET_KEY '')
site_key=$(config_value SITE_KEY '')
captcha_template_path=$(config_value CAPTCHA_TEMPLATE_PATH /var/lib/crowdsec/lua/templates/captcha.html)
captcha_expiration=$(config_value CAPTCHA_EXPIRATION 3600)
appsec_url=$(config_value APPSEC_URL '')
appsec_failure_action=$(config_value APPSEC_FAILURE_ACTION passthrough)
appsec_connect_timeout=$(config_value APPSEC_CONNECT_TIMEOUT '')
appsec_send_timeout=$(config_value APPSEC_SEND_TIMEOUT '')
appsec_process_timeout=$(config_value APPSEC_PROCESS_TIMEOUT '')
always_send_to_appsec=$(config_value ALWAYS_SEND_TO_APPSEC false)
appsec_drop_unreadable_body=$(config_value APPSEC_DROP_UNREADABLE_BODY false)
ssl_verify=$(config_value SSL_VERIFY true)

for name in API_URL API_KEY TLS_CLIENT_CERT TLS_CLIENT_KEY SCENARIOS_CONTAINING SCENARIOS_NOT_CONTAINING EXCLUDE_LOCATION BAN_TEMPLATE_PATH REDIRECT_LOCATION CAPTCHA_PROVIDER SECRET_KEY SITE_KEY CAPTCHA_TEMPLATE_PATH APPSEC_URL APPSEC_FAILURE_ACTION; do
	variable=${name,,}
	variable=${variable//_/_}
	require_no_newline "$name" "${!variable}"
done

for name in ENABLED USE_TLS_AUTH ENABLE_INTERNAL ALWAYS_SEND_TO_APPSEC APPSEC_DROP_UNREADABLE_BODY SSL_VERIFY; do
	variable=${name,,}
	variable=${variable//_/_}
	require_boolean "$name" "${!variable}"
done

for name in CACHE_EXPIRATION REQUEST_TIMEOUT UPDATE_FREQUENCY CAPTCHA_EXPIRATION; do
	variable=${name,,}
	variable=${variable//_/_}
	require_integer "$name" "${!variable}"
done

for name in RET_CODE APPSEC_CONNECT_TIMEOUT APPSEC_SEND_TIMEOUT APPSEC_PROCESS_TIMEOUT; do
	variable=${name,,}
	variable=${variable//_/_}
	[ -z "${!variable}" ] || require_integer "$name" "${!variable}"
done

require_one_of BOUNCING_ON_TYPE "$bouncing_on_type" ban captcha all
require_one_of FALLBACK_REMEDIATION "$fallback_remediation" ban captcha
require_one_of MODE "$mode" live stream
[ -z "$captcha_provider" ] || require_one_of CAPTCHA_PROVIDER "$captcha_provider" recaptcha hcaptcha turnstile

tmp=$(mktemp "${config_path}.tmp.XXXXXX")
umask 077
cat > "$tmp" <<EOF
ENABLED=${enabled}
API_URL=${api_url}
API_KEY=${api_key}
USE_TLS_AUTH=${use_tls_auth}
TLS_CLIENT_CERT=${tls_client_cert}
TLS_CLIENT_KEY=${tls_client_key}
CACHE_EXPIRATION=${cache_expiration}
BOUNCING_ON_TYPE=${bouncing_on_type}
FALLBACK_REMEDIATION=${fallback_remediation}
REQUEST_TIMEOUT=${request_timeout}
UPDATE_FREQUENCY=${update_frequency}
ENABLE_INTERNAL=${enable_internal}
MODE=${mode}
SCENARIOS_CONTAINING=${scenarios_containing}
SCENARIOS_NOT_CONTAINING=${scenarios_not_containing}
EXCLUDE_LOCATION=${exclude_location}
BAN_TEMPLATE_PATH=${ban_template_path}
REDIRECT_LOCATION=${redirect_location}
RET_CODE=${ret_code}
CAPTCHA_PROVIDER=${captcha_provider}
SECRET_KEY=${secret_key}
SITE_KEY=${site_key}
CAPTCHA_TEMPLATE_PATH=${captcha_template_path}
CAPTCHA_EXPIRATION=${captcha_expiration}
APPSEC_URL=${appsec_url}
APPSEC_FAILURE_ACTION=${appsec_failure_action}
APPSEC_CONNECT_TIMEOUT=${appsec_connect_timeout}
APPSEC_SEND_TIMEOUT=${appsec_send_timeout}
APPSEC_PROCESS_TIMEOUT=${appsec_process_timeout}
ALWAYS_SEND_TO_APPSEC=${always_send_to_appsec}
APPSEC_DROP_UNREADABLE_BODY=${appsec_drop_unreadable_body}
SSL_VERIFY=${ssl_verify}
EOF
chmod 600 "$tmp"
mv "$tmp" "$config_path"

log_info "CrowdSec bouncer configuration generated (enabled: ${enabled})."
