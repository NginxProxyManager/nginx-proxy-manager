/// <reference types="cypress" />

// "Test config": POST /api/nginx/<host type>/test checks settings without saving anything.
describe('Host config test', () => {
	// Not a network alias: requests go to the fullstack container with this Host header
	const domain = 'config-test.example.com';
	const otherDomain = 'config-test-new.example.com';

	let token;
	let hostId;
	let sslHostId;
	let certId;
	let missingCertId;
	let disabledHostId;
	let sharedHostId;

	const request = (host, path) => {
		return cy.task('exec', { command: `curl --noproxy '*' -s -w '\n%{http_code}' -H 'Host: ${host}' http://fullstack${path}` }, { log: false })
			.then((result) => {
				expect(result.exitCode).to.eq(0);
				const lines = result.stdout.trim().split('\n');
				const status = lines.pop();
				return { status: status, body: lines.join('\n') };
			});
	};

	const proxyHost = (extra) => {
		return Object.assign({
			domain_names:            [otherDomain],
			forward_scheme:          'http',
			forward_host:            'examplesite',
			forward_port:            80,
			access_list_id:          0,
			certificate_id:          0,
			meta:                    {},
			advanced_config:         '',
			locations:               [],
			block_exploits:          false,
			caching_enabled:         false,
			allow_websocket_upgrade: false,
			http2_support:           false,
			hsts_enabled:            false,
			hsts_subdomains:         false,
			ssl_forced:              false,
		}, extra || {});
	};

	const testProxyHost = (data, returnOnError) => {
		return cy.task('backendApiPost', {
			token:         token,
			path:          '/api/nginx/proxy-hosts/test',
			data:          data,
			returnOnError: !!returnOnError,
		});
	};

	const expectNoHostFor = (name) => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
		}).then((rows) => {
			const found = rows.filter((row) => row.domain_names.includes(name));
			expect(found, `proxy hosts for ${name}`).to.have.length(0);
		});
	};

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should test a new proxy host without creating it', () => {
		testProxyHost(proxyHost()).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/nginx/proxy-hosts/test', data);
			expect(data).to.include({ ok: true, nginx_online: true, nginx_err: null, nginx_details: null });
			expect(data.nginx_locations).to.have.length(0);
			expect(data.warnings).to.have.length(0);
			expect(data.upstreams).to.have.length(1);
			expect(data.upstreams[0]).to.include({ host: 'examplesite', port: 80, ok: true, code: 'ok', location_index: null, path: null });
		});
		expectNoHostFor(otherDomain);
		// nothing was activated: the domain is not served by examplesite
		request(otherDomain, '/').then((res) => {
			expect(res.body).not.to.contain('this is the index page');
		});
	});

	it('Should report custom locations nginx would quarantine or can not resolve', () => {
		testProxyHost(proxyHost({
			locations: [
				{ path: '/ok', forward_scheme: 'http', forward_host: 'examplesite', forward_port: 80 },
				{ path: '/ghost', forward_scheme: 'http', forward_host: 'nonexistent-upstream-npm-test', forward_port: 80 },
				{ path: '/broken', forward_scheme: 'http', forward_host: 'examplesite', forward_port: 80, advanced_config: 'proxy_passs http://examplesite;' },
				{ path: '/off', forward_scheme: 'http', forward_host: 'examplesite', forward_port: 81, enabled: false },
			],
		})).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/nginx/proxy-hosts/test', data);
			expect(data).to.include({ ok: false, nginx_online: true, nginx_err: null });
			expect(data.nginx_locations).to.have.length(4);
			const [okLoc, ghost, broken, off] = data.nginx_locations;
			expect(okLoc).to.include({ index: 0, path: '/ok', status: 'ok' });
			expect(ghost).to.include({ index: 1, path: '/ghost', status: 'unresolved' });
			expect(broken).to.include({ index: 2, path: '/broken', status: 'quarantined' });
			expect(broken.message).to.contain('proxy_passs');
			expect(off).to.include({ index: 3, path: '/off', status: 'disabled' });

			// main target + the enabled locations, the disabled one is not checked
			expect(data.upstreams.map((u) => u.location_index)).to.deep.eq([null, 0, 1, 2]);
			expect(data.upstreams[2]).to.include({ path: '/ghost', ok: false, code: 'dns_not_found' });
		});
		expectNoHostFor(otherDomain);
	});

	it('Should return a host level rejection as ok:false, not as an error', () => {
		testProxyHost(proxyHost({ advanced_config: 'add_header X-Test 1;\nthis_is_not_a_directive on;' })).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/nginx/proxy-hosts/test', data);
			expect(data).to.include({ ok: false, nginx_online: false });
			expect(data.nginx_err).to.contain('Advanced configuration');
			expect(data.nginx_err).to.contain('this_is_not_a_directive');
			expect(data.nginx_err).to.contain('line 2');
			// the temporary config of a new host is not a host the user can look at
			expect(data.nginx_details).to.include({ kind: 'nginx_config', scope: 'host', host_id: null, file: null });
			expect(data.nginx_details.nginx_output).to.contain('this_is_not_a_directive');
		});
		expectNoHostFor(otherDomain);
	});

	it('Should reject an invalid payload like a save', () => {
		testProxyHost(proxyHost({
			locations: [
				{ path: '/api', forward_scheme: 'http', forward_host: 'examplesite', forward_port: 80 },
				{ path: '^~ /api', forward_scheme: 'http', forward_host: 'examplesite', forward_port: 80 },
			],
		}), true).then((data) => {
			cy.validateSwaggerSchema('post', 400, '/nginx/proxy-hosts/test', data);
			expect(data.error).to.have.property('code', 400);
			expect(data.error.message).to.contain('/api');
		});
		testProxyHost(proxyHost({ forward_port: 0 }), true).then((data) => {
			expect(data.error).to.have.property('code', 400);
		});
	});

	it('Should test changes to an existing proxy host without applying them', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data:  proxyHost({ domain_names: [domain] }),
		}).then((data) => {
			hostId = data.id;
			expect(data.meta).to.have.property('nginx_online', true);
		});

		// the domain is taken by another host now
		testProxyHost(proxyHost({ domain_names: [domain] }), true).then((data) => {
			cy.validateSwaggerSchema('post', 400, '/nginx/proxy-hosts/test', data);
			expect(data.error.message).to.contain('already in use');
		});

		cy.then(() => {
			// ... but not for the host itself
			testProxyHost(proxyHost({ id: hostId, domain_names: [domain], advanced_config: 'this_is_not_a_directive on;' })).then((data) => {
				cy.validateSwaggerSchema('post', 200, '/nginx/proxy-hosts/test', data);
				expect(data).to.include({ ok: false, nginx_online: false });
				expect(data.nginx_details).to.include({ scope: 'host', host_type: 'proxy_host', host_id: hostId, file: `/data/nginx/proxy_host/${hostId}.conf` });
			});

			// only the changed fields: merged over the stored host like an update
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/proxy-hosts/test',
				data:  {
					id:             hostId,
					domain_names:   [domain],
					forward_scheme: 'http',
					forward_host:   'examplesite',
					forward_port:   80,
					locations:      [{ path: '/dash', forward_scheme: 'http', forward_host: 'examplesite', forward_port: 80, forward_path: '/dashboard' }],
				},
			}).then((data) => {
				expect(data).to.include({ ok: true, nginx_online: true });
				expect(data.nginx_locations).to.have.length(1);
				expect(data.upstreams).to.have.length(2);
			});

			cy.task('backendApiGet', {
				token: token,
				path:  `/api/nginx/proxy-hosts/${hostId}`,
			}).then((data) => {
				expect(data.advanced_config).to.eq('');
				expect(data.locations).to.have.length(0);
				expect(data.meta).to.include({ nginx_online: true, nginx_err: null });
			});
		});

		// the stored config is still the one being served
		request(domain, '/').then((res) => {
			expect(res.status).to.eq('200');
			expect(res.body).to.contain('this is the index page');
		});
	});

	it('Should test an SSL host with a new certificate requested without its current certificate', () => {
		const sslDomain = 'config-test-ssl.example.com';

		cy.createCustomCerts({ domain: sslDomain, certFile: 'config-test-ssl.pem', keyFile: 'config-test-ssl.key.pem' });
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  { provider: 'other', nice_name: 'Config test certificate' },
		}).then((data) => {
			certId = data.id;
			cy.task('backendApiPostFiles', {
				token: token,
				path:  `/api/nginx/certificates/${certId}/upload`,
				files: { certificate: 'config-test-ssl.pem', certificate_key: 'config-test-ssl.key.pem' },
			});
		});
		// a certificate without files: nginx can't load it
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  { provider: 'other', nice_name: 'Config test certificate without files' },
		}).then((data) => {
			missingCertId = data.id;
		});

		cy.then(() => {
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/proxy-hosts',
				data:  proxyHost({ domain_names: [sslDomain], certificate_id: certId, ssl_forced: true, http2_support: true }),
			}).then((data) => {
				sslHostId = data.id;
				expect(data.meta).to.have.property('nginx_online', true);
			});
		});

		cy.then(() => {
			// sanity check: the test does render the certificate it is given
			testProxyHost(proxyHost({ id: sslHostId, domain_names: [sslDomain], certificate_id: missingCertId })).then((data) => {
				expect(data).to.include({ ok: false, nginx_online: false });
			});

			testProxyHost(proxyHost({ id: sslHostId, domain_names: [sslDomain], certificate_id: 'new', ssl_forced: true, http2_support: true, hsts_enabled: true })).then((data) => {
				cy.validateSwaggerSchema('post', 200, '/nginx/proxy-hosts/test', data);
				expect(data).to.include({ ok: true, nginx_online: true });
				expect(data.warnings.map((w) => w.code)).to.deep.eq(['certificate_pending']);
			});

			cy.task('backendApiGet', {
				token: token,
				path:  `/api/nginx/proxy-hosts/${sslHostId}`,
			}).then((data) => {
				expect(data).to.include({ certificate_id: certId, ssl_forced: true, http2_support: true, hsts_enabled: false });
			});
		});
	});

	it('Should test redirection hosts, 404 hosts and streams', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/redirection-hosts/test',
			data:  {
				domain_names:        ['config-test-redirect.example.com'],
				forward_scheme:      'auto',
				forward_http_code:   301,
				forward_domain_name: 'example.com',
				preserve_path:       true,
				certificate_id:      0,
				meta:                {},
				advanced_config:     '',
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/nginx/redirection-hosts/test', data);
			expect(data).to.include({ ok: true, nginx_online: true });
			expect(data.upstreams).to.have.length(0);
		});

		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/dead-hosts/test',
			data:  {
				domain_names:    ['config-test-dead.example.com'],
				certificate_id:  0,
				meta:            {},
				advanced_config: 'this_is_not_a_directive on;',
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/nginx/dead-hosts/test', data);
			expect(data).to.include({ ok: false, nginx_online: false });
			expect(data.nginx_err).to.contain('this_is_not_a_directive');
		});

		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/streams/test',
			data:  {
				incoming_port:   1599,
				forwarding_host: 'examplesite',
				forwarding_port: 80,
				tcp_forwarding:  true,
				udp_forwarding:  false,
				certificate_id:  0,
				meta:            {},
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/nginx/streams/test', data);
			expect(data).to.include({ ok: true, nginx_online: true });
			expect(data.upstreams).to.have.length(1);
			expect(data.upstreams[0]).to.include({ host: 'examplesite', port: 80, ok: true });
		});

		cy.task('backendApiGet', {
			token: token,
			path:  '/api/nginx/streams',
		}).then((rows) => {
			expect(rows.filter((row) => row.incoming_port === 1599)).to.have.length(0);
		});
	});

	it('Should test a disabled host as it would run once enabled, without enabling it', () => {
		const disabledDomain = 'config-test-disabled.example.com';

		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data:  proxyHost({ domain_names: [disabledDomain] }),
		}).then((data) => {
			disabledHostId = data.id;
			cy.task('backendApiPost', {
				token: token,
				path:  `/api/nginx/proxy-hosts/${disabledHostId}/disable`,
			});
		});

		// nginx reloads are signalled and return immediately: wait until the disabled host is no longer served,
		// so the check at the end shows that the tests did not bring it back
		cy.waitUntil(() => request(disabledDomain, '/').then((res) => !res.body.includes('this is the index page')), {
			timeout:  15000,
			interval: 500,
			errorMsg: 'the disabled host is still served',
		});

		cy.then(() => {
			// a disabled host renders an empty config: the test must still check what enabling would load
			testProxyHost(proxyHost({ id: disabledHostId, domain_names: [disabledDomain], advanced_config: 'this_is_not_a_directive on;' })).then((data) => {
				cy.validateSwaggerSchema('post', 200, '/nginx/proxy-hosts/test', data);
				expect(data).to.include({ ok: false, nginx_online: false });
				expect(data.nginx_err).to.contain('this_is_not_a_directive');
			});
			testProxyHost(proxyHost({ id: disabledHostId, domain_names: [disabledDomain] })).then((data) => {
				expect(data).to.include({ ok: true, nginx_online: true });
			});

			cy.task('backendApiGet', {
				token: token,
				path:  `/api/nginx/proxy-hosts/${disabledHostId}`,
			}).then((data) => {
				expect(data).to.include({ enabled: false, advanced_config: '' });
			});
		});

		// still disabled: the domain is not served
		request(disabledDomain, '/').then((res) => {
			expect(res.body).not.to.contain('this is the index page');
		});
	});

	it('Should not let users who are not admins test an advanced config', () => {
		const sharedDomain = 'config-test-shared.example.com';
		const email = 'config-tester@example.com';
		const testAs = (userToken, path, data) => cy.task('backendApiPost', {
			token:         userToken,
			path:          path,
			data:          data,
			returnOnError: true,
		});
		const expectDenied = (data) => {
			expect(data.error, JSON.stringify(data)).to.have.property('code', 403);
			expect(data.error.message).to.equal('Permission Denied');
		};

		// an admin's host with an advanced config, shared with the user ('Created Items Only' + proxy_host_ids)
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data:  proxyHost({
				domain_names:    [sharedDomain],
				advanced_config: 'add_header X-Shared 1;',
				locations:       [{ path: '/api', forward_scheme: 'http', forward_host: 'examplesite', forward_port: 80, advanced_config: 'add_header X-Api 1;' }],
			}),
		}).then((host) => {
			sharedHostId = host.id;
			return cy.task('backendApiPost', {
				token: token,
				path:  '/api/users',
				data:  {
					name:     email,
					nickname: 'config-tester',
					email:    email,
					roles:    ['user'],
					auth:     { type: 'password', secret: 'changeme' },
				},
			});
		}).then((user) => {
			return cy.task('backendApiPut', {
				token: token,
				path:  `/api/users/${user.id}/permissions`,
				data:  {
					visibility:        'user',
					proxy_hosts:       'manage',
					redirection_hosts: 'manage',
					dead_hosts:        'manage',
					meta:              { proxy_host_ids: [sharedHostId] },
				},
			});
		}).then(() => cy.getToken(null, { identity: email, secret: 'changeme' })).then((userToken) => {
			// new hosts
			testAs(userToken, '/api/nginx/proxy-hosts/test', proxyHost({ advanced_config: 'add_header X-Mine 1;' })).then(expectDenied);
			testAs(userToken, '/api/nginx/proxy-hosts/test', proxyHost({
				locations: [{ path: '/a', forward_scheme: 'http', forward_host: 'examplesite', forward_port: 80, advanced_config: 'return 200;' }],
			})).then(expectDenied);
			testAs(userToken, '/api/nginx/dead-hosts/test', {
				domain_names:    ['config-test-dead-user.example.com'],
				advanced_config: 'return 200;',
			}).then(expectDenied);
			testAs(userToken, '/api/nginx/proxy-hosts/test', proxyHost()).then((data) => {
				expect(data).to.include({ ok: true });
			});

			// the shared host: visible to the user, its advanced configs can't be changed by a test either
			testAs(userToken, '/api/nginx/proxy-hosts/test', proxyHost({
				id:              sharedHostId,
				domain_names:    [sharedDomain],
				advanced_config: 'this_is_not_a_directive on;',
			})).then(expectDenied);
			testAs(userToken, '/api/nginx/proxy-hosts/test', {
				id:             sharedHostId,
				domain_names:   [sharedDomain],
				forward_scheme: 'http',
				forward_host:   'examplesite',
				forward_port:   80,
				locations:      [{ path: '/api', forward_scheme: 'http', forward_host: 'examplesite', forward_port: 80, advanced_config: 'add_header X-Shared 1;' }],
			}).then(expectDenied);
			// clearing a location's config is allowed (deleting the location is too)
			testAs(userToken, '/api/nginx/proxy-hosts/test', {
				id:             sharedHostId,
				domain_names:   [sharedDomain],
				forward_scheme: 'http',
				forward_host:   'examplesite',
				forward_port:   80,
				locations:      [{ path: '/api', forward_scheme: 'http', forward_host: 'examplesite', forward_port: 80, advanced_config: '' }],
			}).then((data) => {
				expect(data).to.include({ ok: true, nginx_online: true });
			});
			// without advanced configs in the payload the saved ones are tested
			testAs(userToken, '/api/nginx/proxy-hosts/test', {
				id:             sharedHostId,
				domain_names:   [sharedDomain],
				forward_scheme: 'http',
				forward_host:   'examplesite',
				forward_port:   80,
				locations:      [{ path: '/api', forward_scheme: 'http', forward_host: 'examplesite', forward_port: 80 }],
			}).then((data) => {
				cy.validateSwaggerSchema('post', 200, '/nginx/proxy-hosts/test', data);
				expect(data).to.include({ ok: true, nginx_online: true });
				expect(data.nginx_locations).to.have.length(1);
			});
		});

		// nothing was changed by the tests
		cy.then(() => cy.task('backendApiGet', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${sharedHostId}`,
		})).then((data) => {
			expect(data.advanced_config).to.equal('add_header X-Shared 1;');
			expect(data.locations[0].advanced_config).to.equal('add_header X-Api 1;');
		});
	});

	after(() => {
		for (const id of [hostId, sslHostId, disabledHostId, sharedHostId]) {
			if (id) {
				cy.task('backendApiDelete', {
					token: token,
					path:  `/api/nginx/proxy-hosts/${id}`,
				});
			}
		}
		for (const id of [certId, missingCertId]) {
			if (id) {
				cy.task('backendApiDelete', {
					token: token,
					path:  `/api/nginx/certificates/${id}`,
				});
			}
		}
	});
});
