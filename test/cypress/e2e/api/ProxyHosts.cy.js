/// <reference types="cypress" />

describe('Proxy Hosts endpoints', () => {
	let token;
	let proxyHostId;
	let certificateId;

	const certFile = 'website1.pem';
	const keyFile = 'website1.key.pem';

	before(() => {
		cy.createCustomCerts({
			domain: 'website1.example.com',
			certFile,
			keyFile,
		});

		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should create a proxy host with HTTP/3 disabled by default', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data:  {
				domain_names:   ['test.example.com'],
				forward_scheme: 'http',
				forward_host:   '1.1.1.1',
				forward_port:   80,
				access_list_id: '0',
				certificate_id: 0,
				meta:           {
					dns_challenge: false,
				},
				advanced_config:         '',
				locations:               [],
				block_exploits:          false,
				caching_enabled:         false,
				allow_websocket_upgrade: false,
				http2_support:           false,
				http3_support:           false,
				hsts_enabled:            false,
				hsts_subdomains:         false,
				ssl_forced:              false,
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', data);
			expect(data.id).to.be.greaterThan(0);
			expect(data).to.have.property('enabled', true);
			expect(data).to.have.property('http3_support', false);
			proxyHostId = data.id;
		});
	});

	it('Should enable HTTP/3 for a proxy host with a certificate', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				provider:  'other',
				nice_name: 'Custom Certificate for HTTP3 Proxy Host',
			},
		}).then((data) => {
			certificateId = data.id;
			return cy.task('backendApiPostFiles', {
				token: token,
				path:  '/api/nginx/certificates/' + certificateId + '/upload',
				files: {
					certificate:     certFile,
					certificate_key: keyFile,
				},
			});
		}).then(() => {
			return cy.task('backendApiPut', {
				token: token,
				path:  '/api/nginx/proxy-hosts/' + proxyHostId,
				data:  {
					certificate_id: certificateId,
					http2_support:  true,
					http3_support:  true,
				},
			});
		}).then((hostData) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', hostData);
			expect(hostData).to.have.property('http2_support', true);
			expect(hostData).to.have.property('http3_support', true);
		});
	});

	it('Should reject a manual QUIC listener for a managed HTTP/3 proxy host', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/nginx/proxy-hosts/' + proxyHostId,
			returnOnError: true,
			data: {
				advanced_config: 'listen 443 quic reuseport;',
			},
		}).then((errorData) => {
			expect(errorData).to.have.nested.property('error.message');
			expect(errorData.error.message).to.contain('manual QUIC listen');
		});
	});

	it('Should retain HTTP/3 through a normal disable and re-enable lifecycle', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/nginx/proxy-hosts/' + proxyHostId,
			data:  { enabled: false },
		}).then((disabledData) => {
			expect(disabledData).to.have.property('enabled', false);
			return cy.task('backendApiPut', {
				token: token,
				path:  '/api/nginx/proxy-hosts/' + proxyHostId,
				data:  { enabled: true },
			});
		}).then((enabledData) => {
			expect(enabledData).to.have.property('enabled', true);
			expect(enabledData).to.have.property('http3_support', true);
		});
	});

	it('Should protect UDP port 443 in both directions', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/streams',
			returnOnError: true,
			data:  {
				incoming_port:    443,
				forwarding_host:  '127.0.0.1',
				forwarding_port:  80,
				meta:             {},
				tcp_forwarding:   false,
				udp_forwarding:   true,
			},
		}).then((errorData) => {
			expect(errorData).to.have.nested.property('error.message');
			expect(errorData.error.message).to.contain('HTTP/3');
			return cy.task('backendApiPut', {
				token: token,
				path:  '/api/nginx/proxy-hosts/' + proxyHostId,
				data:  { http3_support: false },
			});
		}).then(() => {
			return cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/streams',
				data:  {
					incoming_port:   443,
					forwarding_host: '127.0.0.1',
					forwarding_port: 80,
					meta:            {},
					tcp_forwarding:  false,
					udp_forwarding:  true,
				},
			});
		}).then((streamData) => {
			return cy.task('backendApiPut', {
				token: token,
				path:  '/api/nginx/proxy-hosts/' + proxyHostId,
				returnOnError: true,
				data:  { http3_support: true },
			}).then((hostErrorData) => {
				expect(hostErrorData).to.have.nested.property('error.message');
				expect(hostErrorData.error.message).to.contain('UDP port 443');
				return cy.task('backendApiDelete', {
					token: token,
					path:  '/api/nginx/streams/' + streamData.id,
				});
			});
		});
	});
});
