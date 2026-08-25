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

	it('Should be able to create a http host', () => {
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
					dns_challenge: false
				},
				advanced_config:         '',
				locations:               [],
				block_exploits:          false,
				caching_enabled:         true,
				asset_cache_ttl:         21600,
				gzip_enabled:            true,
				gzip_comp_level:         6,
				gzip_types:              ['application/javascript', 'application/json', 'text/css'],
				allow_websocket_upgrade: false,
				http2_support:           false,
				http3_support:           false,
				hsts_enabled:            false,
				hsts_subdomains:         false,
				ssl_forced:              false
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			proxyHostId = data.id;
			expect(data).to.have.property('enabled');
			expect(data).to.have.property("enabled", true);
			expect(data).to.have.property('asset_cache_ttl', 21600);
			expect(data).to.have.property('gzip_enabled', true);
			expect(data).to.have.property('gzip_comp_level', 6);
			expect(data).to.have.deep.property('gzip_types', ['application/javascript', 'application/json', 'text/css']);
			expect(data).to.have.property('http3_support', false);
			expect(data).to.have.property('meta');
			expect(typeof data.meta.nginx_online).to.be.equal('undefined');
		});
	});

	it('Should persist updated gzip and asset cache settings', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/nginx/proxy-hosts/' + proxyHostId,
			data:  {
				asset_cache_ttl: 86400,
				caching_enabled: true,
				gzip_enabled: false,
				gzip_comp_level: 9,
				gzip_types: [],
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data).to.have.property('asset_cache_ttl', 86400);
			expect(data).to.have.property('gzip_enabled', false);
			expect(data).to.have.property('gzip_comp_level', 9);
			expect(data).to.have.deep.property('gzip_types', []);

			cy.task('backendApiGet', {
				token: token,
				path:  '/api/nginx/proxy-hosts/' + proxyHostId,
			}).then((savedData) => {
				cy.validateSwaggerSchema('get', 200, '/nginx/proxy-hosts/{hostID}', savedData);
				expect(savedData).to.have.property('asset_cache_ttl', 86400);
				expect(savedData).to.have.property('gzip_enabled', false);
				expect(savedData).to.have.deep.property('gzip_types', []);
			});
		});
	});

	it('Should reject unsafe gzip and cache values', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/nginx/proxy-hosts/' + proxyHostId,
			returnOnError: true,
			data:  {
				asset_cache_ttl: 0,
				gzip_comp_level: 10,
				gzip_types: ['text/css; include /tmp/unsafe.conf'],
			},
		}).then((data) => {
			expect(data).to.have.nested.property('error.message');
		});
	});

	it('Should support disabling and re-enabling through a normal update', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/nginx/proxy-hosts/' + proxyHostId,
			data:  {
				enabled: false,
			},
		}).then((disabledData) => {
			expect(disabledData).to.have.property('enabled', false);

			cy.task('backendApiPut', {
				token: token,
				path:  '/api/nginx/proxy-hosts/' + proxyHostId,
				data:  {
					enabled: true,
				},
			}).then((enabledData) => {
				expect(enabledData).to.have.property('enabled', true);
			});
		});
	});

	it('Should enable HTTP/3 for a proxy host with a certificate', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				provider: 'other',
				nice_name: 'Custom Certificate for HTTP3 Proxy Host',
			},
		}).then((data) => {
			certificateId = data.id;

			cy.task('backendApiPostFiles', {
				token: token,
				path:  '/api/nginx/certificates/' + certificateId + '/upload',
				files: {
					certificate: certFile,
					certificate_key: keyFile,
				},
			}).then(() => {
				cy.task('backendApiPut', {
					token: token,
					path:  '/api/nginx/proxy-hosts/' + proxyHostId,
					data: {
						certificate_id: certificateId,
						http2_support: true,
						http3_support: true,
					},
				}).then((hostData) => {
					cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', hostData);
					expect(hostData).to.have.property('http2_support', true);
					expect(hostData).to.have.property('http3_support', true);

					cy.task('backendApiPut', {
						token: token,
						path: '/api/nginx/proxy-hosts/' + proxyHostId,
						returnOnError: true,
						data: {
							advanced_config: 'listen 443 quic reuseport;',
						},
					}).then((errorData) => {
						expect(errorData).to.have.nested.property('error.message');
						expect(errorData.error.message).to.contain('manual QUIC listen');
					});
				});
			});
		});
	});

	it('Should protect UDP port 443 in both directions', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/streams',
			returnOnError: true,
			data: {
				incoming_port: 443,
				forwarding_host: '127.0.0.1',
				forwarding_port: 80,
				meta: {},
				tcp_forwarding: false,
				udp_forwarding: true,
			},
		}).then((errorData) => {
			expect(errorData).to.have.nested.property('error.message');
			expect(errorData.error.message).to.contain('HTTP/3');

			cy.task('backendApiPut', {
				token: token,
				path:  '/api/nginx/proxy-hosts/' + proxyHostId,
				data: {
					http3_support: false,
				},
			}).then(() => {
				cy.task('backendApiPost', {
					token: token,
					path:  '/api/nginx/streams',
					data: {
						incoming_port: 443,
						forwarding_host: '127.0.0.1',
						forwarding_port: 80,
						meta: {},
						tcp_forwarding: false,
						udp_forwarding: true,
					},
				}).then((streamData) => {
					cy.task('backendApiPut', {
						token: token,
						path:  '/api/nginx/proxy-hosts/' + proxyHostId,
						returnOnError: true,
						data: {
							http3_support: true,
						},
					}).then((hostErrorData) => {
						expect(hostErrorData).to.have.nested.property('error.message');
						expect(hostErrorData.error.message).to.contain('UDP port 443');

						cy.task('backendApiDelete', {
							token: token,
							path:  '/api/nginx/streams/' + streamData.id,
						});
					});
				});
			});
		});
	});

});
