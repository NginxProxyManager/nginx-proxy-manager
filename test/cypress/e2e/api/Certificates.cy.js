/// <reference types="cypress" />

describe('Certificates endpoints', () => {
	let token;
	let certID;

	const certFile = 'test.example.com.pem';
	const keyFile = 'test.example.com-key.pem';
	// Second pair for the same domain, with a different private key
	const renewedCertFile = 'test-renewed.example.com.pem';
	const renewedKeyFile = 'test-renewed.example.com-key.pem';

	before(() => {
		cy.createCustomCerts({
			domain: 'test.example.com',
			certFile,
			keyFile,
		})
		cy.createCustomCerts({
			domain:   'test.example.com',
			certFile: renewedCertFile,
			keyFile:  renewedKeyFile,
		})

		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Validate custom certificate', () => {
		cy.task('backendApiPostFiles', {
			token: token,
			path:  '/api/nginx/certificates/validate',
			files:  {
				certificate: certFile,
				certificate_key: keyFile,
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/nginx/certificates/validate', data);
			expect(data).to.have.property('certificate');
			expect(data).to.have.property('certificate_key');
		});
	});

	it('Unauthenticated user cannot validate custom certificate', () => {
		cy.task('backendApiPostFiles', {
			path:          '/api/nginx/certificates/validate',
			files:         {
				certificate:     certFile,
				certificate_key: keyFile,
			},
			returnOnError: true,
		}).then((data) => {
			expect(data.error.code).to.equal(403);
		});
	});

	it('User with certificates view permission cannot validate custom certificate', () => {
		const viewer = {
			email:  'viewer@example.com',
			secret: 'changeme',
		};

		cy.task('backendApiPost', {
			token: token,
			path:  '/api/users',
			data:  {
				name:     'Certificate Viewer',
				nickname: 'Viewer',
				email:    viewer.email,
				roles:    ['user'],
				auth:     {
					type:   'password',
					secret: viewer.secret,
				},
			},
		}).then((user) => {
			cy.task('backendApiPut', {
				token: token,
				path:  `/api/users/${user.id}/permissions`,
				data:  {
					certificates: 'view',
				},
			});

			cy.getToken(null, {identity: viewer.email, secret: viewer.secret}).then((viewerToken) => {
				cy.task('backendApiPostFiles', {
					token:         viewerToken,
					path:          '/api/nginx/certificates/validate',
					files:         {
						certificate:     certFile,
						certificate_key: keyFile,
					},
					returnOnError: true,
				}).then((data) => {
					expect(data.error.code).to.equal(403);
				});
			});
		});
	});

	it('Custom certificate lifecycle', () => {
		// Create custom cert
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				provider: "other",
				nice_name: "Test Certificate",
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
					certificate: certFile,
					certificate_key: keyFile,
				},
			}).then((data) => {
				cy.validateSwaggerSchema('post', 200, '/nginx/certificates/{certID}/upload', data);
				expect(data).to.have.property('certificate');
				expect(data).to.have.property('certificate_key');

				// Get all certs
				cy.task('backendApiGet', {
					token: token,
					path:  '/api/nginx/certificates?expand=owner'
				}).then((data) => {
					cy.validateSwaggerSchema('get', 200, '/nginx/certificates', data);
					expect(data.length).to.be.greaterThan(0);
					const cert = data.find((c) => c.id === certID);
					expect(cert.meta).to.have.property('certificate');
					expect(cert.meta).to.not.have.property('certificate_key');

					// Delete cert
					cy.task('backendApiDelete', {
						token: token,
						path:  `/api/nginx/certificates/${certID}`
					}).then((data) => {
						cy.validateSwaggerSchema('delete', 200, '/nginx/certificates/{certID}', data);
						expect(data).to.be.equal(true);
					});
				});
			});
		});
	});

	it('Custom certificate renewal', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				provider:  'other',
				nice_name: 'Renewal Test Certificate',
			},
		}).then((created) => {
			const renewID = created.id;

			// Initial upload
			cy.task('backendApiPostFiles', {
				token: token,
				path:  `/api/nginx/certificates/${renewID}/upload`,
				files: {
					certificate:     certFile,
					certificate_key: keyFile,
				},
			}).then((data) => {
				cy.validateSwaggerSchema('post', 200, '/nginx/certificates/{certID}/upload', data);
			});

			// Upload again with an intermediate certificate, any valid certificate will do here
			cy.task('backendApiPostFiles', {
				token: token,
				path:  `/api/nginx/certificates/${renewID}/upload`,
				files: {
					certificate:              certFile,
					certificate_key:          keyFile,
					intermediate_certificate: renewedCertFile,
				},
			}).then((data) => {
				cy.validateSwaggerSchema('post', 200, '/nginx/certificates/{certID}/upload', data);
				expect(data).to.have.property('intermediate_certificate');
			});

			cy.task('backendApiGet', {
				token: token,
				path:  `/api/nginx/certificates/${renewID}`,
			}).then((data) => {
				expect(data.meta).to.have.property('intermediate_certificate');
			});

			// Certificate with a private key that doesn't belong to it
			cy.task('backendApiPostFiles', {
				token:         token,
				path:          `/api/nginx/certificates/${renewID}/upload`,
				files:         {
					certificate:     certFile,
					certificate_key: renewedKeyFile,
				},
				returnOnError: true,
			}).then((data) => {
				expect(data.error.code).to.equal(400);
				expect(data.error.message).to.contain('Certificate and private key do not match');
			});

			// New certificate only, which doesn't match the stored private key
			cy.task('backendApiPostFiles', {
				token:         token,
				path:          `/api/nginx/certificates/${renewID}/upload`,
				files:         {
					certificate: renewedCertFile,
				},
				returnOnError: true,
			}).then((data) => {
				expect(data.error.code).to.equal(400);
				expect(data.error.message).to.contain('Certificate and private key do not match');
			});

			// Renew with a matching certificate and key
			cy.task('getFixturesFolder').then((fixturesFolder) => {
				cy.readFile(`${fixturesFolder}/${renewedCertFile}`).then((renewedCert) => {
					cy.task('backendApiPostFiles', {
						token: token,
						path:  `/api/nginx/certificates/${renewID}/upload`,
						files: {
							certificate:     renewedCertFile,
							certificate_key: renewedKeyFile,
						},
					}).then((data) => {
						cy.validateSwaggerSchema('post', 200, '/nginx/certificates/{certID}/upload', data);
						expect(data.certificate).to.equal(renewedCert);
						expect(data).to.not.have.property('intermediate_certificate');
					});
				});
			});

			// Certificate only, matching the stored private key
			cy.task('backendApiPostFiles', {
				token: token,
				path:  `/api/nginx/certificates/${renewID}/upload`,
				files: {
					certificate: renewedCertFile,
				},
			}).then((data) => {
				cy.validateSwaggerSchema('post', 200, '/nginx/certificates/{certID}/upload', data);
				expect(data).to.have.property('certificate');
				expect(data).to.not.have.property('certificate_key');
			});

			// Same certificate record was updated in place
			cy.task('backendApiGet', {
				token: token,
				path:  `/api/nginx/certificates/${renewID}`,
			}).then((data) => {
				cy.validateSwaggerSchema('get', 200, '/nginx/certificates/{certID}', data);
				expect(data.id).to.equal(renewID);
				expect(data.provider).to.equal('other');
				expect(data.meta).to.not.have.property('certificate_key');
				// The intermediate of the previous certificate must not be kept
				expect(data.meta).to.not.have.property('intermediate_certificate');
			});

			cy.task('backendApiDelete', {
				token: token,
				path:  `/api/nginx/certificates/${renewID}`,
			}).then((data) => {
				expect(data).to.be.equal(true);
			});
		});
	});

	it('User with certificates view permission cannot upload custom certificate', () => {
		const viewer = {
			email:  `upload-viewer-${Date.now()}@example.com`,
			secret: 'changeme',
		};

		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				provider:  'other',
				nice_name: 'Viewer Upload Test Certificate',
			},
		}).then((created) => {
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/users',
				data:  {
					name:     'Certificate Upload Viewer',
					nickname: 'UploadViewer',
					email:    viewer.email,
					roles:    ['user'],
					auth:     {
						type:   'password',
						secret: viewer.secret,
					},
				},
			}).then((user) => {
				cy.task('backendApiPut', {
					token: token,
					path:  `/api/users/${user.id}/permissions`,
					data:  {
						visibility:   'all',
						certificates: 'view',
					},
				});

				cy.getToken(null, {identity: viewer.email, secret: viewer.secret}).then((viewerToken) => {
					cy.task('backendApiPostFiles', {
						token:         viewerToken,
						path:          `/api/nginx/certificates/${created.id}/upload`,
						files:         {
							certificate:     certFile,
							certificate_key: keyFile,
						},
						returnOnError: true,
					}).then((data) => {
						expect(data.error.code).to.equal(403);
					});
				});
			});

			cy.task('backendApiDelete', {
				token: token,
				path:  `/api/nginx/certificates/${created.id}`,
			});
		});
	});

	it('Renewing a custom certificate that is in use by a proxy host', () => {
		const domain = `cert-renewal-${Date.now()}.example.com`;

		cy.task('getCertificateFingerprint', certFile).as('originalFingerprint');
		cy.task('getCertificateFingerprint', renewedCertFile).as('renewedFingerprint');

		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				provider:  'other',
				nice_name: 'In Use Renewal Test Certificate',
			},
		}).then((created) => {
			const inUseCertID = created.id;

			cy.task('backendApiPostFiles', {
				token: token,
				path:  `/api/nginx/certificates/${inUseCertID}/upload`,
				files: {
					certificate:     certFile,
					certificate_key: keyFile,
				},
			}).then((data) => {
				cy.validateSwaggerSchema('post', 200, '/nginx/certificates/{certID}/upload', data);
			});

			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/proxy-hosts',
				data:  {
					domain_names:   [domain],
					forward_scheme: 'http',
					forward_host:   '1.1.1.1',
					forward_port:   80,
					access_list_id: '0',
					certificate_id: inUseCertID,
					meta:           {
						dns_challenge: false
					},
					advanced_config:         '',
					locations:               [],
					block_exploits:          false,
					caching_enabled:         false,
					allow_websocket_upgrade: false,
					http2_support:           false,
					hsts_enabled:            false,
					hsts_subdomains:         false,
					ssl_forced:              true
				}
			}).then((host) => {
				// No schema validation here: the expanded certificate in this response has is_deleted,
				// which the proxy host schema doesn't allow. Unrelated to certificate uploads.
				expect(host.certificate_id).to.equal(inUseCertID);

				// nginx serves the original certificate
				cy.get('@originalFingerprint').then((expected) => {
					cy.task('getServedCertificateFingerprint', {
						servername: domain,
						expected,
					}).should('equal', expected);
				});

				// Renew in place
				cy.task('backendApiPostFiles', {
					token: token,
					path:  `/api/nginx/certificates/${inUseCertID}/upload`,
					files: {
						certificate:     renewedCertFile,
						certificate_key: renewedKeyFile,
					},
				}).then((data) => {
					cy.validateSwaggerSchema('post', 200, '/nginx/certificates/{certID}/upload', data);
				});

				cy.task('backendApiGet', {
					token: token,
					path:  `/api/nginx/proxy-hosts/${host.id}`,
				}).then((data) => {
					cy.validateSwaggerSchema('get', 200, '/nginx/proxy-hosts/{hostID}', data);
					expect(data.certificate_id).to.equal(inUseCertID);
				});

				// nginx serves the renewed certificate after the reload
				cy.get('@renewedFingerprint').then((expected) => {
					cy.task('getServedCertificateFingerprint', {
						servername: domain,
						expected,
					}).should('equal', expected);
				});

				cy.task('backendApiDelete', {
					token: token,
					path:  `/api/nginx/proxy-hosts/${host.id}`,
				}).then((data) => {
					expect(data).to.be.equal(true);
				});
			});

			cy.task('backendApiDelete', {
				token: token,
				path:  `/api/nginx/certificates/${inUseCertID}`,
			}).then((data) => {
				expect(data).to.be.equal(true);
			});
		});
	});

	it('Custom certificate upload errors', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				provider:  'other',
				nice_name: 'Upload Errors Test Certificate',
			},
		}).then((created) => {
			const path = `/api/nginx/certificates/${created.id}/upload`;

			// No files
			cy.task('backendApiPostFilesWithStatus', {
				token: token,
				path,
				files: {},
			}).then((res) => {
				expect(res.status).to.equal(400);
			});

			// Key without a certificate
			cy.task('backendApiPostFilesWithStatus', {
				token: token,
				path,
				files: {
					certificate_key: keyFile,
				},
			}).then((res) => {
				expect(res.status).to.equal(400);
				expect(res.data.error.message).to.contain('Certificate file was not provided');
			});

			// Unknown certificate
			cy.task('backendApiPostFilesWithStatus', {
				token: token,
				path:  '/api/nginx/certificates/999999/upload',
				files: {
					certificate:     certFile,
					certificate_key: keyFile,
				},
			}).then((res) => {
				expect(res.status).to.equal(404);
			});

			// No token, same as the other unauthenticated certificate endpoints
			cy.task('backendApiPostFilesWithStatus', {
				path,
				files: {
					certificate:     certFile,
					certificate_key: keyFile,
				},
			}).then((res) => {
				expect(res.status).to.equal(403);
			});

			cy.task('backendApiDelete', {
				token: token,
				path:  `/api/nginx/certificates/${created.id}`,
			});
		});
	});

	it('Request Certificate - CVE-2024-46256/CVE-2024-46257', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				domain_names: ['test.com"||echo hello-world||\\\\n test.com"'],
				meta:         {
					dns_challenge: false,
				},
				provider: 'letsencrypt',
			},
			returnOnError: true,
		}).then((data) => {
			cy.validateSwaggerSchema('post', 400, '/nginx/certificates', data);
			expect(data).to.have.property('error');
			expect(data.error).to.have.property('message');
			expect(data.error).to.have.property('code');
			expect(data.error.code).to.equal(400);
			expect(data.error.message).to.contain('data/domain_names/0 must match pattern');
		});
	});
});
