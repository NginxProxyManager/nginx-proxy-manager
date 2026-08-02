const BLOCKING_DIRECTIVES = new Set([
	"proxy_pass",
	"listen",
	"ssl_certificate",
	"ssl_certificate_key",
]);
const WARNING_DIRECTIVES = new Set([
	"proxy_connect_timeout",
	"proxy_send_timeout",
	"proxy_read_timeout",
	"proxy_buffering",
	"proxy_request_buffering",
	"proxy_buffer_size",
	"proxy_busy_buffers_size",
	"proxy_buffers",
	"proxy_max_temp_file_size",
	"proxy_temp_file_write_size",
	"proxy_limit_rate",
	"proxy_headers_hash_bucket_size",
	"proxy_headers_hash_max_size",
	"proxy_http_version",
	"proxy_method",
	"proxy_pass_request_headers",
	"proxy_pass_request_body",
	"proxy_pass_trailers",
	"proxy_ignore_client_abort",
	"proxy_socket_keepalive",
	"proxy_bind",
	"proxy_set_header",
	"proxy_hide_header",
	"proxy_pass_header",
	"proxy_ignore_headers",
	"add_header",
	"proxy_next_upstream",
	"proxy_next_upstream_timeout",
	"proxy_next_upstream_tries",
	"proxy_intercept_errors",
	"proxy_force_ranges",
	"proxy_redirect",
	"proxy_cookie_domain",
	"proxy_cookie_path",
	"proxy_ssl_server_name",
	"proxy_ssl_name",
	"proxy_ssl_verify",
	"proxy_ssl_verify_depth",
	"proxy_ssl_session_reuse",
	"proxy_ssl_protocols",
	"proxy_ssl_ciphers",
]);

const diagnostic = (severity, code, line, message) => ({ severity, code, scope: "advanced_config", line, message });

/**
 * A deliberately small lexer: it recognises top-level directive tokens while
 * ignoring comments and quoted strings. It is not an nginx parser; nginx -t
 * remains the final authority.
 *
 * @param {string|undefined|null} config
 * @returns {Array<object>}
 */
export const scanAdvancedConfig = (config) => {
	if (!config) {
		return [];
	}
	const result = [];
	let token = "";
	let line = 1;
	let tokenLine = 1;
	let quote = null;
	let escaped = false;
	let comment = false;
	let depth = 0;

	const flushDirective = (delimiter) => {
		const directive = token.trim().split(/\s+/)[0]?.toLowerCase();
		if (!directive) {
			token = "";
			return;
		}
		if (depth === 0) {
			if (directive === "server" || directive === "location") {
				result.push(diagnostic("error", "ADVANCED_MANAGED_BLOCK", tokenLine, `Advanced config may not define ${directive} blocks`));
			} else if (BLOCKING_DIRECTIVES.has(directive)) {
				result.push(diagnostic("error", "ADVANCED_MANAGED_DIRECTIVE", tokenLine, `Advanced config may not define ${directive}`));
			} else if (directive === "include" && /(?:proxy\.conf|_access\.conf|_certificates\.conf)/i.test(token)) {
				result.push(diagnostic("error", "ADVANCED_MANAGED_INCLUDE", tokenLine, "Advanced config may not replace managed includes"));
			} else if (WARNING_DIRECTIVES.has(directive)) {
				result.push(diagnostic("warning", "ADVANCED_STRUCTURED_CONFLICT", tokenLine, `Advanced config may override structured ${directive} settings`));
			}
		}
		token = "";
		if (delimiter === "{") {
			depth += 1;
		}
	};

	for (let index = 0; index < config.length; index += 1) {
		const char = config[index];
		if (comment) {
			if (char === "\n") {
				comment = false;
				line += 1;
			}
			continue;
		}
		if (quote) {
			token += char;
			if (char === "\n") line += 1;
			if (escaped) {
				escaped = false;
			} else if (char === "\\") {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}
		if (char === "#") {
			comment = true;
			continue;
		}
		if (char === "\"" || char === "'") {
			quote = char;
			token += char;
			continue;
		}
		if (char === "\n") {
			line += 1;
			token += " ";
			continue;
		}
		if (char === ";" || char === "{") {
			flushDirective(char);
			tokenLine = line;
			continue;
		}
		if (char === "}") {
			token = "";
			depth = Math.max(0, depth - 1);
			tokenLine = line;
			continue;
		}
		if (!token && /\S/.test(char)) tokenLine = line;
		token += char;
	}
	return result;
};

export const hasDiagnosticErrors = (diagnostics) => diagnostics.some((item) => item.severity === "error");
export default { scanAdvancedConfig, hasDiagnosticErrors };
