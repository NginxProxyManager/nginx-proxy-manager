/// <reference types="cypress" />

describe('Streams', () => {
	let token;

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;
			// Set default site content
			cy.task('backendApiPut', {
				token: token,
				path:  '/api/settings/default-site',
				data: {
					value: 'html',
					meta: {
						html: '<p>yay it works</p>'
					},
				},
			}).then((data) => {
				cy.validateSwaggerSchema('put', 200, '/settings/{settingID}', data);
			});
		});

		// Create a custom cert pair
		cy.exec('mkcert -cert-file=/test/cypress/fixtures/website1.pem -key-file=/test/cypress/fixtures/website1.key.pem website1.example.com').then((result) => {
			expect(result.code).to.eq(0);
			// Install CA
			cy.exec('mkcert -install').then((result) => {
				expect(result.code).to.eq(0);
			});
		});

		cy.exec('rm -f /test/results/testssl.json');
	});

	it('Should be able to create TCP Stream', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/streams',
			data:  {
				incoming_port: 1500,
				forwarding_host: '127.0.0.1',
				forwarding_port: 80,
				certificate_id: 0,
				meta: {
					dns_provider_credentials: "",
					letsencrypt_agree: false,
					dns_challenge: true
				},
				tcp_forwarding: true,
				udp_forwarding: false
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/streams', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			expect(data).to.have.property('enabled', true);
			expect(data).to.have.property('tcp_forwarding', true);
			expect(data).to.have.property('udp_forwarding', false);

			cy.exec('curl --noproxy -- http://website1.example.com:1500').then((result) => {
				expect(result.code).to.eq(0);
				expect(result.stdout).to.contain('yay it works');
			});
		});
	});

	it('Should be able to create UDP Stream', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/streams',
			data:  {
				incoming_port: 1501,
				forwarding_host: '127.0.0.1',
				forwarding_port: 80,
				certificate_id: 0,
				meta: {
					dns_provider_credentials: "",
					letsencrypt_agree: false,
					dns_challenge: true
				},
				tcp_forwarding: false,
				udp_forwarding: true
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/streams', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			expect(data).to.have.property('enabled', true);
			expect(data).to.have.property('tcp_forwarding', false);
			expect(data).to.have.property('udp_forwarding', true);
		});
	});

	it('Should be able to create TCP/UDP Stream', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/streams',
			data:  {
				incoming_port: 1502,
				forwarding_host: '127.0.0.1',
				forwarding_port: 80,
				certificate_id: 0,
				meta: {
					dns_provider_credentials: "",
					letsencrypt_agree: false,
					dns_challenge: true
				},
				tcp_forwarding: true,
				udp_forwarding: true
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/streams', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			expect(data).to.have.property('enabled', true);
			expect(data).to.have.property('tcp_forwarding', true);
			expect(data).to.have.property('udp_forwarding', true);

			cy.exec('curl --noproxy -- http://website1.example.com:1502').then((result) => {
				expect(result.code).to.eq(0);
				expect(result.stdout).to.contain('yay it works');
			});
		});
	});

	it('Should be able to create SSL TCP Stream', () => {
		let certID = 0;

		// Create custom cert
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				provider: "other",
				nice_name: "Custom Certificate for SSL Stream",
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/certificates', data);
			expect(data).to.have.property('id');
			certID = data.id;

			// Upload files
			cy.task('backendApiPostFiles', {
				token: token,
				path:  `/api/nginx/certificates/${certID}/upload`,
				files:  {
					certificate: 'website1.pem',
					certificate_key: 'website1.key.pem',
				},
			}).then((data) => {
				cy.validateSwaggerSchema('post', 200, '/nginx/certificates/{certID}/upload', data);
				expect(data).to.have.property('certificate');
				expect(data).to.have.property('certificate_key');

				// Create the stream
				cy.task('backendApiPost', {
					token: token,
					path:  '/api/nginx/streams',
					data:  {
						incoming_port: 1503,
						forwarding_host: '127.0.0.1',
						forwarding_port: 80,
						certificate_id: certID,
						meta: {
							dns_provider_credentials: "",
							letsencrypt_agree: false,
							dns_challenge: true
						},
						tcp_forwarding: true,
						udp_forwarding: false
					}
				}).then((data) => {
					cy.validateSwaggerSchema('post', 201, '/nginx/streams', data);
					expect(data).to.have.property('id');
					expect(data.id).to.be.greaterThan(0);
					expect(data).to.have.property("enabled", true);
					expect(data).to.have.property('tcp_forwarding', true);
					expect(data).to.have.property('udp_forwarding', false);
					expect(data).to.have.property('certificate_id', certID);

					// Check the ssl termination
					cy.task('log', '[testssl.sh] Running ...');
					cy.exec('/testssl/testssl.sh --quiet --add-ca="$(/bin/mkcert -CAROOT)/rootCA.pem" --jsonfile=/test/results/testssl.json website1.example.com:1503', {
						timeout: 120000, // 2 minutes
					}).then((result) => {
						cy.task('log', `[testssl.sh] ${result.stdout}`);

						const allowedSeverities = ["INFO", "OK", "LOW", "MEDIUM"];
						const ignoredIDs = [
							'cert_chain_of_trust',
							'cert_extlifeSpan',
							'cert_revocation',
							'overall_grade',
						];

						cy.readFile('/test/results/testssl.json').then((data) => {
							// Parse each array item
							for (let i = 0; i < data.length; i++) {
								const item = data[i];
								if (ignoredIDs.includes(item.id)) {
									continue;
								}
								expect(item.severity).to.be.oneOf(allowedSeverities);
							}
						});
					});
				});
			});
		});
	});

	it('Should be able to List Streams', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/nginx/streams?expand=owner,certificate',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/nginx/streams', data);
			expect(data.length).to.be.greaterThan(0);
			expect(data[0]).to.have.property('id');
			expect(data[0]).to.have.property('enabled');
		});
	});

});
