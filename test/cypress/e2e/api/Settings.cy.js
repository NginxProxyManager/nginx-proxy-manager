/// <reference types="cypress" />

describe('Settings endpoints', () => {
	let token;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Get all settings', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/settings',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/settings', data);
			expect(data.length).to.be.greaterThan(0);
		});
	});

	it('Get default-site setting', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/settings/default-site',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.equal('default-site');
		});
	});

	it('Default Site congratulations', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/settings/default-site',
			data: {
				value: 'congratulations',
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.equal('default-site');
			expect(data).to.have.property('value');
			expect(data.value).to.be.equal('congratulations');
		});
	});

	it('Default Site 404', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/settings/default-site',
			data: {
				value: '404',
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.equal('default-site');
			expect(data).to.have.property('value');
			expect(data.value).to.be.equal('404');
		});
	});

	it('Default Site 444', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/settings/default-site',
			data: {
				value: '444',
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.equal('default-site');
			expect(data).to.have.property('value');
			expect(data.value).to.be.equal('444');
		});
	});

	it('Default Site redirect', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/settings/default-site',
			data: {
				value: 'redirect',
				meta: {
					redirect: 'https://www.google.com',
				},
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.equal('default-site');
			expect(data).to.have.property('value');
			expect(data.value).to.be.equal('redirect');
			expect(data).to.have.property('meta');
			expect(data.meta).to.have.property('redirect');
			expect(data.meta.redirect).to.be.equal('https://www.google.com');
		});
	});

	it('Default Site html', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/settings/default-site',
			data: {
				value: 'html',
				meta: {
					html: '<p>hello world</p>'
				},
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.equal('default-site');
			expect(data).to.have.property('value');
			expect(data.value).to.be.equal('html');
			expect(data).to.have.property('meta');
			expect(data.meta).to.have.property('html');
			expect(data.meta.html).to.be.equal('<p>hello world</p>');
		});
	});

	it('Default Site with SSL disabled (certificate_id 0)', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/settings/default-site',
			data: {
				value: '404',
				meta: {
					certificate_id: 0,
					ssl_forced: false,
				},
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.equal('default-site');
			expect(data).to.have.property('meta');
			expect(data.meta.certificate_id).to.be.equal(0);
			expect(data.meta.ssl_forced).to.be.equal(false);
		});
	});

	it('Default Site with SSL enabled (certificate_id > 0, ssl_forced true)', () => {
		// Create a custom cert and upload PEM material so the rendered
		// nginx config can actually point at on-disk files.
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				provider:  'other',
				nice_name: 'Default Site Cert',
			},
		}).then((cert) => {
			expect(cert).to.have.property('id');
			const certID = cert.id;

			cy.task('backendApiPostFiles', {
				token: token,
				path:  `/api/nginx/certificates/${certID}/upload`,
				files: {
					certificate:     'test.example.com.pem',
					certificate_key: 'test.example.com-key.pem',
				},
			}).then(() => {
				// Attach the cert + force SSL to the default site
				cy.task('backendApiPut', {
					token: token,
					path:  '/api/settings/default-site',
					data: {
						value: '404',
						meta: {
							certificate_id: certID,
							ssl_forced:     true,
						},
					},
				}).then((data) => {
					cy.validateSwaggerSchema('put', 200, '/settings/{settingID}', data);
					expect(data.meta.certificate_id).to.be.equal(certID);
					expect(data.meta.ssl_forced).to.be.equal(true);
					// Response must NOT leak the joined certificate row or
					// the resolved certificate_id / ssl_forced at the top
					// level — those are template-only fields.
					expect(data).to.not.have.property('certificate');
					expect(data).to.not.have.property('certificate_id');
					expect(data).to.not.have.property('ssl_forced');
				});

				// Clean up so the next test starts fresh
				cy.task('backendApiDelete', {
					token: token,
					path:  `/api/nginx/certificates/${certID}`,
				});
			});
		});
	});

	it('Default Site is unaffected when an unrelated certificate is deleted', () => {
		// Two custom certs: A is attached to the default-site, B is unrelated.
		// Deleting B must not touch the default-site's meta.
		const createCert = (name) => cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  { provider: 'other', nice_name: name },
		}).then((cert) => {
			return cy.task('backendApiPostFiles', {
				token: token,
				path:  `/api/nginx/certificates/${cert.id}/upload`,
				files: {
					certificate:     'test.example.com.pem',
					certificate_key: 'test.example.com-key.pem',
				},
			}).then(() => cert.id);
		});

		createCert('Default-Site Cert A').then((aID) => {
			createCert('Unrelated Cert B').then((bID) => {
				cy.task('backendApiPut', {
					token: token,
					path:  '/api/settings/default-site',
					data: {
						value: '404',
						meta: { certificate_id: aID, ssl_forced: true },
					},
				});

				// Delete B (the unrelated one)
				cy.task('backendApiDelete', {
					token: token,
					path:  `/api/nginx/certificates/${bID}`,
				}).then(() => {
					cy.task('backendApiGet', {
						token: token,
						path:  '/api/settings/default-site',
					}).then((data) => {
						cy.validateSwaggerSchema('get', 200, '/settings/{settingID}', data);
						// Default-site should still reference A unchanged
						expect(data.meta.certificate_id).to.be.equal(aID);
						expect(data.meta.ssl_forced).to.be.equal(true);
					});

					// Cleanup
					cy.task('backendApiDelete', {
						token: token,
						path:  `/api/nginx/certificates/${aID}`,
					});
				});
			});
		});
	});

	it('Default Site falls back to no-SSL when its certificate is deleted', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				provider:  'other',
				nice_name: 'Disposable Cert',
			},
		}).then((cert) => {
			const certID = cert.id;

			cy.task('backendApiPostFiles', {
				token: token,
				path:  `/api/nginx/certificates/${certID}/upload`,
				files: {
					certificate:     'test.example.com.pem',
					certificate_key: 'test.example.com-key.pem',
				},
			}).then(() => {
				cy.task('backendApiPut', {
					token: token,
					path:  '/api/settings/default-site',
					data: {
						value: '404',
						meta: {
							certificate_id: certID,
							ssl_forced:     true,
						},
					},
				}).then((data) => {
					expect(data.meta.certificate_id).to.be.equal(certID);
					expect(data.meta.ssl_forced).to.be.equal(true);
				});

				// Delete the cert that the default-site references
				cy.task('backendApiDelete', {
					token: token,
					path:  `/api/nginx/certificates/${certID}`,
				}).then(() => {
					// The default-site row should have been cleaned up
					cy.task('backendApiGet', {
						token: token,
						path:  '/api/settings/default-site',
					}).then((data) => {
						cy.validateSwaggerSchema('get', 200, '/settings/{settingID}', data);
						expect(data.meta.certificate_id).to.be.equal(0);
						expect(data.meta.ssl_forced).to.be.equal(false);
					});
				});
			});
		});
	});
});
