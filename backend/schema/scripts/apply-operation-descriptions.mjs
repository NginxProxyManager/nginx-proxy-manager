#!/usr/bin/env node
/**
 * Add operation-level `description` to path fragment JSON files (Vacuum operation-description).
 * Run from repo root: node backend/schema/scripts/apply-operation-descriptions.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATHS_DIR = join(__dirname, "..", "paths");

/** operationId → operation description (min quality for Vacuum / Redoc) */
const DESCRIPTIONS = {
	health:
		"Public health check for the admin API. Returns setup status and semantic version fields without authentication.",
	schema:
		"Returns the fully dereferenced OpenAPI document for this running instance. Used by dev Swagger on port 3082 and for live schema inspection.",
	listApiKeys:
		"Lists automation API keys. Secrets are never returned; each entry indicates whether a key is still configured.",
	createApiKey:
		"Creates a long-lived API key for automation. The raw key is returned once in the response and cannot be retrieved again.",
	deleteApiKey:
		"Revokes an API key by id. Revoked keys fail authentication immediately.",
	getAuditLogs:
		"Returns paginated audit log entries for administrative review.",
	getAuditLog:
		"Returns a single audit log entry by id.",
	listCredentialProviders:
		"Lists external credential store providers (Vault, AWS, Azure, Infisical, HTTP). Client secrets are not included in responses.",
	createCredentialProvider:
		"Registers an external credential store provider. OIDC or Universal Auth credentials are stored encrypted under the data volume.",
	getCredentialProvider:
		"Returns one credential provider configuration by id without secret material.",
	updateCredentialProvider:
		"Updates provider settings. Omit secret fields to keep existing encrypted values.",
	deleteCredentialProvider:
		"Soft-deletes a credential provider. Existing certificate references may fail resolution until updated.",
	testCredentialProvider:
		"Verifies that the provider can obtain an access token (Vault/AWS/HTTP OIDC client credentials or Infisical Universal Auth).",
	testCredentialProviderResolve:
		"Tests resolving a secret path through the provider without returning secret contents (response includes byte length only).",
	listCredentials:
		"Lists DNS credentials stored in the encrypted NPM vault on the data volume.",
	createCredential:
		"Creates a named DNS credential (certbot provider INI) in the internal vault for certificate issuance.",
	getCredential:
		"Returns metadata for one stored DNS credential. Secret payload is not exposed.",
	updateCredential:
		"Updates a stored DNS credential name or encrypted provider configuration.",
	deleteCredential:
		"Deletes a stored DNS credential from the vault.",
	testCredential:
		"Validates that a stored credential can be decrypted and parsed for the configured DNS provider.",
	migrateLegacyCredentials:
		"Moves inline DNS provider credentials from certificates into the vault. Supports dry-run preview before apply.",
	listJobs:
		"Lists recent asynchronous automation jobs (certificate issuance, migrations, etc.).",
	getJob:
		"Returns status and result metadata for one background job by id.",
	listWebhooks:
		"Lists outbound webhook endpoints configured for automation events.",
	createWebhook:
		"Creates a webhook endpoint with optional HMAC signing secret.",
	deleteWebhook:
		"Deletes a webhook configuration by id.",
	getAccessLists:
		"Returns all access lists (HTTP authentication and access rules) configured in NPM.",
	createAccessList:
		"Creates an access list for use on proxy hosts, redirection hosts, or streams.",
	getAccessList:
		"Returns one access list including authorization and access rule entries.",
	updateAccessList:
		"Updates an access list and its nested auth or access items.",
	deleteAccessList:
		"Deletes an access list. Hosts referencing it must be updated separately.",
	getCertificates:
		"Lists SSL certificates known to NPM including managed, custom, and in-progress orders.",
	createCertificate:
		"Requests a new certificate (HTTP, DNS, or custom workflow depending on payload).",
	getCertificate:
		"Returns one certificate record and metadata by id.",
	updateCertificate:
		"Updates certificate metadata such as friendly name or linked hosts.",
	deleteCertificate:
		"Deletes a certificate record. Does not remove files already deployed to disk until nginx is reloaded.",
	downloadCertificate:
		"Downloads certificate and private key material for a certificate id (requires permission).",
	renewCertificate:
		"Triggers renewal for an existing managed certificate.",
	uploadCertificate:
		"Uploads custom certificate and key files for use on proxy hosts.",
	getDNSProviders:
		"Lists DNS providers supported for ACME DNS challenge certificate issuance.",
	testHttpReach:
		"Tests HTTP reachability for domain validation prior to certificate issuance.",
	validateCertificates:
		"Validates stored certificates and reports expiry or configuration issues.",
	getDeadHosts:
		"Lists 404 / catch-all hosts (dead hosts) configured in NPM.",
	create404Host:
		"Creates a 404 host that serves a default site when no other host matches.",
	getDeadHost:
		"Returns one 404 host configuration by id.",
	updateDeadHost:
		"Updates a 404 host domain names, forwarding, or enabled state.",
	deleteDeadHost:
		"Deletes a 404 host by id.",
	disableDeadHost:
		"Disables a 404 host without deleting its configuration.",
	enableDeadHost:
		"Enables a previously disabled 404 host and reloads nginx when required.",
	getProxyHosts:
		"Lists reverse proxy hosts (domain to upstream mapping).",
	createProxyHost:
		"Creates a proxy host with domain names, upstream target, and optional TLS and access settings.",
	getProxyHost:
		"Returns one proxy host by id.",
	updateProxyHost:
		"Updates proxy host domains, upstream, advanced options, or certificate linkage.",
	deleteProxyHost:
		"Deletes a proxy host by id.",
	disableProxyHost:
		"Disables a proxy host in nginx without removing the database record.",
	enableProxyHost:
		"Enables a proxy host and applies nginx configuration.",
	getRedirectionHosts:
		"Lists HTTP redirection hosts (domain-level redirects).",
	createRedirectionHost:
		"Creates a redirection host with source domains and target URL or scheme.",
	getRedirectionHost:
		"Returns one redirection host by id.",
	updateRedirectionHost:
		"Updates redirection host matching rules and destination.",
	deleteRedirectionHost:
		"Deletes a redirection host by id.",
	disableRedirectionHost:
		"Disables a redirection host without deleting configuration.",
	enableRedirectionHost:
		"Enables a redirection host in nginx.",
	getStreams:
		"Lists TCP/UDP stream proxies configured in NPM.",
	createStream:
		"Creates a layer-4 stream forwarding entry.",
	getStream:
		"Returns one stream definition by id.",
	updateStream:
		"Updates stream listen ports, upstream, or protocol options.",
	deleteStream:
		"Deletes a stream by id.",
	disableStream:
		"Disables a stream in nginx without deleting the record.",
	enableStream:
		"Enables a stream and reloads nginx configuration.",
	reportsHosts:
		"Returns reporting data about configured hosts for dashboards and diagnostics.",
	getSettings:
		"Lists application settings keys and values visible to the authenticated administrator.",
	getSetting:
		"Returns one setting by id or key identifier.",
	updateSetting:
		"Updates a single application setting value.",
	refreshToken:
		"Refreshes an existing JWT using a valid refresh token cookie or body field.",
	requestToken:
		"Authenticates with email and password and returns JWT access and refresh tokens.",
	loginWith2FA:
		"Completes login when two-factor authentication is required for the account.",
	getUsers:
		"Lists administrator accounts and role assignments.",
	createUser:
		"Creates a new administrator user with roles and permissions.",
	getUser:
		"Returns one user record by id.",
	updateUser:
		"Updates user profile fields such as name or email.",
	deleteUser:
		"Deletes a user account by id.",
	disableUser2fa:
		"Disables two-factor authentication for a user (requires administrative permission).",
	getUser2faStatus:
		"Returns whether two-factor authentication is enabled for the user.",
	setupUser2fa:
		"Starts TOTP enrollment and returns QR code / secret material for the user.",
	regenUser2faCodes:
		"Regenerates one-time backup codes after verifying an existing TOTP code.",
	enableUser2fa:
		"Confirms TOTP enrollment with a verification code and enables 2FA.",
	updateUserAuth:
		"Updates password or authentication-related fields for a user.",
	loginAsUser:
		"Issues a session token for the target user (administrative impersonation).",
	updateUserPermissions:
		"Updates fine-grained permissions and roles assigned to a user.",
	checkVersion:
		"Checks whether a newer upstream release is available compared to the running version.",
};

const walk = (dir, files = []) => {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, files);
		else if (name.endsWith(".json")) files.push(p);
	}
	return files;
};

let updated = 0;
let skipped = 0;

for (const file of walk(PATHS_DIR)) {
	const raw = readFileSync(file, "utf8");
	const op = JSON.parse(raw);
	if (!op.operationId) {
		skipped++;
		continue;
	}
	const text = DESCRIPTIONS[op.operationId];
	if (!text) {
		console.warn(`No description mapping for ${op.operationId} in ${file}`);
		skipped++;
		continue;
	}
	if (op.description === text) {
		skipped++;
		continue;
	}
	const ordered = { ...op, description: text };
	const { operationId, summary, tags, security, description, ...rest } = ordered;
	const out = {
		operationId,
		summary,
		...(tags ? { tags } : {}),
		...(security ? { security } : {}),
		description,
		...rest,
	};
	writeFileSync(file, `${JSON.stringify(out, null, "\t")}\n`, "utf8");
	updated++;
}

console.log(`Updated ${updated} path files, skipped ${skipped}.`);
