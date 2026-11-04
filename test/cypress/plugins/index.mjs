import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import tls from "node:tls";
import { plugin as cypressGrepPlugin } from "@cypress/grep/plugin";
import { SwaggerValidation } from "@jc21/cypress-swagger-validation";
import chalk from "chalk";
import backendTask from "./backendApi/task.mjs";

export default (on, config) => {
	// Replace swaggerBase config var wildcard
	if (typeof config.env.swaggerBase !== "undefined") {
		config.env.swaggerBase = config.env.swaggerBase.replace(
			"{{baseUrl}}",
			config.baseUrl,
		);
	}

	cypressGrepPlugin(config);

	// Plugin Events
	on("task", SwaggerValidation(config));
	on("task", backendTask(config));
	on("task", {
		log(message) {
			console.log(
				`${chalk.cyan.bold("[")}${chalk.blue.bold("LOG")}${chalk.cyan.bold("]")} ${chalk.red.bold(message)}`,
			);
			return null;
		},
	});
	on("task", {
		getFixturesFolder() {
			return config.fixturesFolder;
		},
	});
	on("task", {
		/**
		 * @param   {string}  file  Fixture file name of a PEM certificate
		 * @returns {string}  SHA-256 fingerprint
		 */
		getCertificateFingerprint(file) {
			const pem = fs.readFileSync(`${config.fixturesFolder}/${file}`);
			return new X509Certificate(pem).fingerprint256;
		},

		/**
		 * Connects with TLS and returns the fingerprint of the certificate nginx serves.
		 * When expected is given, retries until it matches or the timeout passes (nginx reloads gracefully).
		 *
		 * @param   {object}  options
		 * @param   {string}  [options.host]  Defaults to the host of baseUrl
		 * @param   {number}  [options.port]  Defaults to env.httpsPort or 443
		 * @param   {string}  options.servername
		 * @param   {string}  [options.expected]
		 * @param   {number}  [options.timeout]
		 * @returns {Promise<string>}
		 */
		async getServedCertificateFingerprint(options) {
			const fetchFingerprint = () =>
				new Promise((resolve, reject) => {
					const socket = tls.connect(
						{
							host: options.host || new URL(config.baseUrl).hostname,
							port: options.port || config.env.httpsPort || 443,
							servername: options.servername,
							rejectUnauthorized: false,
						},
						() => {
							const cert = socket.getPeerX509Certificate();
							socket.end();
							resolve(cert ? cert.fingerprint256 : null);
						},
					);
					socket.setTimeout(5000, () => {
						socket.destroy(new Error("TLS connection timed out"));
					});
					socket.on("error", reject);
				});

			const deadline = Date.now() + (options.timeout || 10000);
			let fingerprint = null;
			while (Date.now() < deadline) {
				try {
					fingerprint = await fetchFingerprint();
				} catch (err) {
					fingerprint = `error: ${err.message}`;
				}
				if (!options.expected || fingerprint === options.expected) {
					return fingerprint;
				}
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
			return fingerprint;
		},
	});

	return config;
};
