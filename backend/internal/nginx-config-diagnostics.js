import { PROXY_MANAGED_DIRECTIVES } from "./nginx-proxy-directive-catalog.js";

const BLOCKING_DIRECTIVES = new Set([
	"access_log",
	"proxy_pass",
	"listen",
	"ssl_certificate",
	"ssl_certificate_key",
]);
const MANAGED_DIRECTIVES = new Set(PROXY_MANAGED_DIRECTIVES);

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
				const message = directive === "access_log"
					? "Advanced config may not define access_log; it would disable required proxy monitoring logs"
					: `Advanced config may not define ${directive}`;
				result.push(diagnostic("error", "ADVANCED_MANAGED_DIRECTIVE", tokenLine, message));
			} else if (directive === "include" && /(?:proxy\.conf|_access\.conf|_certificates\.conf)/i.test(token)) {
				result.push(diagnostic("error", "ADVANCED_MANAGED_INCLUDE", tokenLine, "Advanced config may not replace managed includes"));
			} else if (MANAGED_DIRECTIVES.has(directive)) {
				result.push(diagnostic("error", "ADVANCED_STRUCTURED_CONFLICT", tokenLine, `Advanced config may not override structured ${directive} settings`));
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
