import http from "node:http";
import { SoftAuthenticator } from "./softAuthenticator.mjs";

/**
 * Tasks for testing access lists with security keys and tokens.
 *
 * Requests go straight to NPM's http port with any Host header, so proxy host
 * domains don't need to resolve. A software authenticator stands in for a security key.
 */
export default (config) => {
	const npmHost = new URL(config.baseUrl).hostname;
	const npmPort = Number.parseInt(process.env.NPM_HTTP_PORT || "80", 10);
	let authenticator = new SoftAuthenticator();

	return {
		/**
		 * @param   {object}  options
		 * @param   {string}  options.host       Host header, the proxy host domain
		 * @param   {string}  options.path
		 * @param   {string}  [options.method]
		 * @param   {object}  [options.headers]
		 * @param   {object}  [options.body]     Sent as JSON
		 * @returns {Promise<{status: number, headers: object, body: any}>}
		 */
		gateRequest: ({ host, path, method = "GET", headers = {}, body }) =>
			new Promise((resolve, reject) => {
				const data = typeof body === "undefined" ? undefined : JSON.stringify(body);
				const req = http.request(
					{
						host: npmHost,
						port: npmPort,
						method,
						path,
						// nginx drops idle keep-alive connections when it reloads
						agent: false,
						headers: {
							Host: host,
							...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
							...headers,
						},
					},
					(res) => {
						let text = "";
						res.on("data", (chunk) => {
							text += chunk;
						});
						res.on("end", () => {
							let parsed = text;
							try {
								parsed = JSON.parse(text);
							} catch {
								// not JSON
							}
							resolve({ status: res.statusCode, headers: res.headers, body: parsed });
						});
					},
				);
				req.on("error", reject);
				if (data) {
					req.write(data);
				}
				req.end();
			}),

		softAuthenticatorReset: () => {
			authenticator = new SoftAuthenticator();
			return null;
		},

		/**
		 * @param   {object}  options
		 * @param   {object}  options.options  Registration options from the enrollment page API
		 * @param   {string}  options.origin
		 * @returns {object}  Registration response
		 */
		softAuthenticatorCreate: ({ options, origin }) => authenticator.create(options, origin),

		/**
		 * @param   {object}  options
		 * @param   {object}  options.options  Authentication options from the sign-in page API
		 * @param   {string}  options.origin
		 * @param   {string}  [options.credentialId]  Sign with this credential, even if it isn't offered
		 * @returns {object}  Authentication response
		 */
		softAuthenticatorGet: ({ options, origin, credentialId }) => {
			if (credentialId) {
				return authenticator
					.only(credentialId)
					.get({ ...options, allowCredentials: [{ id: credentialId }] }, origin);
			}
			return authenticator.get(options, origin);
		},
	};
};
