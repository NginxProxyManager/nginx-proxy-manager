/// <reference types="cypress" />

// Tests for the custom ports feature (HTTP_PORT, HTTPS_PORT, WEB_UI_PORT env vars).
//
// The CI environment runs NPM with default ports (80/443/81). These tests verify
// the default-port baseline and proxy host behaviour with port-aware nginx templates.
// To test non-default ports, run NPM with e.g. HTTP_PORT=8080 HTTPS_PORT=8443 and
// update the port constants below.

const { hostname: NPM_HOST } = new URL(Cypress.config('baseUrl'));
const HTTP_PORT   = Cypress.env('HTTP_PORT')  || 80;
const HTTPS_PORT  = Cypress.env('HTTPS_PORT') || 443;
const WEB_UI_PORT = Cypress.env('WEB_UI_PORT') || 81;

describe('Custom Ports', () => {
	let token;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	// ── Port accessibility ───────────────────────────────────────────────────

	it(`HTTP fallback server responds on port ${HTTP_PORT}`, () => {
		cy.request({
			url:              `http://${NPM_HOST}:${HTTP_PORT}`,
			failOnStatusCode: false,
		}).then((response) => {
			// The NPM fallback server always returns a non-5xx response
			expect(response.status).to.be.lessThan(500);
		});
	});

	it(`Admin Web UI responds on port ${WEB_UI_PORT}`, () => {
		cy.request({
			url:              `http://${NPM_HOST}:${WEB_UI_PORT}/api/`,
			failOnStatusCode: false,
		}).then((response) => {
			expect(response.status).to.be.lessThan(500);
			expect(response.body).to.have.property('status', 'OK');
		});
	});

	// ── Proxy host template variables ────────────────────────────────────────

	it('Proxy host creation succeeds with port-aware nginx templates', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data:  {
				domain_names:            ['custom-ports-test.example.com'],
				forward_scheme:          'http',
				forward_host:            '127.0.0.1',
				forward_port:            3000,
				access_list_id:          '0',
				certificate_id:          0,
				meta:                    { dns_challenge: false },
				advanced_config:         '',
				locations:               [],
				block_exploits:          false,
				caching_enabled:         false,
				allow_websocket_upgrade: false,
				http2_support:           false,
				hsts_enabled:            false,
				hsts_subdomains:         false,
				ssl_forced:              false,
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			expect(data).to.have.property('enabled', true);

			// Fetch the created host and verify it's retrievable
			cy.task('backendApiGet', {
				token: token,
				path:  `/api/nginx/proxy-hosts/${data.id}`,
			}).then((host) => {
				cy.validateSwaggerSchema('get', 200, '/nginx/proxy-hosts/{hostID}', host);
				expect(host.id).to.equal(data.id);
				expect(host.domain_names).to.deep.equal(['custom-ports-test.example.com']);
			});

			// Clean up
			cy.task('backendApiDelete', {
				token: token,
				path:  `/api/nginx/proxy-hosts/${data.id}`,
			});
		});
	});

	// ── Port change after a previous custom port was already set ────────────
	//
	// When a user changes ports a second time (e.g. HTTP_PORT was 8080 and is
	// now changed to 9090), the nginx config files already contain 8080, not
	// the image default 80. The expected result is that the new
	// port appears in the config and the previous custom port is gone.

	it('port regex matches any number, not just image defaults (80 → 8080 → 9090)', () => {
		const applyPortSed = (config, httpPort, httpsPort, webUiPort) =>
			config
				.replace(/listen (\d+)(;)/g,               `listen ${httpPort}$2`)
				.replace(/listen \[::\]:(\d+)(;)/g,        `listen [::]:${httpPort}$2`)
				.replace(/listen (\d+)( ssl)/g,             `listen ${httpsPort}$2`)
				.replace(/listen \[::\]:(\d+)( ssl)/g,     `listen [::]:${httpsPort}$2`)
				.replace(/listen (\d+)( default)/g,         `listen ${webUiPort}$2`)
				.replace(/listen \[::\]:(\d+)( default)/g, `listen [::]:${webUiPort}$2`);

		const fresh = [
			'listen 80;',
			'listen [::]:80;',
			'listen 443 ssl;',
			'listen [::]:443 ssl;',
			'listen 81 default;',
			'listen [::]:81 default;',
		].join('\n');

		// First change: image defaults → custom ports
		const afterFirst = applyPortSed(fresh, 8080, 8443, 8181);
		expect(afterFirst).to.include('listen 8080;');
		expect(afterFirst).to.include('listen 8443 ssl;');
		expect(afterFirst).to.include('listen 8181 default;');
		expect(afterFirst).not.to.include('listen 80;');
		expect(afterFirst).not.to.include('listen 443 ssl;');

		// Second change: custom ports → new custom ports (the maintainer's scenario)
		const afterSecond = applyPortSed(afterFirst, 9090, 9443, 9191);
		expect(afterSecond).to.include('listen 9090;');
		expect(afterSecond).to.include('listen [::]:9090;');
		expect(afterSecond).to.include('listen 9443 ssl;');
		expect(afterSecond).to.include('listen [::]:9443 ssl;');
		expect(afterSecond).to.include('listen 9191 default;');
		expect(afterSecond).to.include('listen [::]:9191 default;');

		// Old custom ports from the first change must be gone
		expect(afterSecond).not.to.include('listen 8080;');
		expect(afterSecond).not.to.include('listen 8443 ssl;');
		expect(afterSecond).not.to.include('listen 8181 default;');
	});

	it('HTTPS regex does not corrupt HTTP port during a second port change', () => {
		const applyPortSed = (config, httpPort, httpsPort) =>
			config
				.replace(/listen (\d+)(;)/g,          `listen ${httpPort}$2`)
				.replace(/listen (\d+)( ssl)/g,        `listen ${httpsPort}$2`);

		// After first change both ports are custom
		const config = 'listen 8080;\nlisten 8443 ssl;\n';

		const result = applyPortSed(config, 9090, 9443);

		// Ports must be updated independently
		expect(result).to.include('listen 9090;');
		expect(result).to.include('listen 9443 ssl;');

		// Verify no cross-contamination: HTTP port not set to HTTPS value
		expect(result).not.to.include('listen 9443;');
		// Verify HTTPS port not set to HTTP value
		expect(result).not.to.include('listen 9090 ssl;');
	});

	it('Multiple proxy hosts can be created without port conflicts', () => {
		const hosts = [];

		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data: {
				domain_names:            ['ports-host-1.example.com'],
				forward_scheme:          'http',
				forward_host:            '127.0.0.1',
				forward_port:            3001,
				access_list_id:          '0',
				certificate_id:          0,
				meta:                    { dns_challenge: false },
				advanced_config:         '',
				locations:               [],
				block_exploits:          false,
				caching_enabled:         false,
				allow_websocket_upgrade: false,
				http2_support:           false,
				hsts_enabled:            false,
				hsts_subdomains:         false,
				ssl_forced:              false,
			},
		}).then((h1) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', h1);
			expect(h1.id).to.be.greaterThan(0);
			hosts.push(h1.id);

			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/proxy-hosts',
				data: {
					domain_names:            ['ports-host-2.example.com'],
					forward_scheme:          'http',
					forward_host:            '127.0.0.1',
					forward_port:            3002,
					access_list_id:          '0',
					certificate_id:          0,
					meta:                    { dns_challenge: false },
					advanced_config:         '',
					locations:               [],
					block_exploits:          false,
					caching_enabled:         false,
					allow_websocket_upgrade: false,
					http2_support:           false,
					hsts_enabled:            false,
					hsts_subdomains:         false,
					ssl_forced:              false,
				},
			}).then((h2) => {
				cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', h2);
				expect(h2.id).to.be.greaterThan(0);
				hosts.push(h2.id);

				// Both hosts should be independently fetchable
				cy.task('backendApiGet', {
					token: token,
					path:  `/api/nginx/proxy-hosts/${h1.id}`,
				}).then((fetched) => {
					expect(fetched.domain_names).to.deep.equal(['ports-host-1.example.com']);
				});

				cy.task('backendApiGet', {
					token: token,
					path:  `/api/nginx/proxy-hosts/${h2.id}`,
				}).then((fetched) => {
					expect(fetched.domain_names).to.deep.equal(['ports-host-2.example.com']);
				});

				// Clean up both
				hosts.forEach((id) => {
					cy.task('backendApiDelete', {
						token: token,
						path:  `/api/nginx/proxy-hosts/${id}`,
					});
				});
			});
		});
	});
});
