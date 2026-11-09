/// <reference types="cypress" />

describe('Non-admin host and permission rules', () => {
	const ADMIN_CONFIG = 'add_header X-Admin-Only "1";';
	const nonAdmin = {
		email:  'nonadmin-hosts@example.com',
		secret: 'changeme',
	};

	let token;
	let userId;
	let userToken;
	let hostId;

	const hostPayload = (overrides) => Object.assign({
		domain_names:   ['nonadmin-hosts.example.com'],
		forward_scheme: 'http',
		forward_host:   '1.1.1.1',
		forward_port:   80,
		access_list_id: '0',
		certificate_id: 0,
		meta:           { dns_challenge: false },
		advanced_config: '',
		locations:       [],
		block_exploits:  false,
		caching_enabled: false,
		allow_websocket_upgrade: false,
		http2_support:   false,
		hsts_enabled:    false,
		hsts_subdomains: false,
		ssl_forced:      false,
	}, overrides || {});

	const location = (path, advancedConfig) => ({
		path:            path,
		forward_scheme:  'http',
		forward_host:    '1.1.1.1',
		forward_port:    8080,
		advanced_config: advancedConfig,
	});

	const getPermissions = () => cy.task('backendApiGet', {
		token: token,
		path:  `/api/users/${userId}?expand=permissions`,
	}).then((user) => user.permissions);

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;

			// Admin-owned host with an admin-written location config
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/proxy-hosts',
				data:  hostPayload({ locations: [location('/api', ADMIN_CONFIG)] }),
			}).then((host) => {
				hostId = host.id;

				cy.task('backendApiPost', {
					token: token,
					path:  '/api/users',
					data:  {
						name:     'Non Admin',
						nickname: 'NonAdmin',
						email:    nonAdmin.email,
						roles:    [],
						auth:     { type: 'password', secret: nonAdmin.secret },
					},
				}).then((user) => {
					userId = user.id;
					cy.task('backendApiPut', {
						token: token,
						path:  `/api/users/${userId}/permissions`,
						data:  {
							visibility:   'user',
							proxy_hosts:  'manage',
							certificates: 'manage',
							meta:         { proxy_host_ids: [hostId] },
						},
					});
					cy.getToken(null, { identity: nonAdmin.email, secret: nonAdmin.secret }).then((tok2) => {
						userToken = tok2;
					});
				});
			});
		});
	});

	it('Refused advanced config change does not request a certificate first', () => {
		cy.task('backendApiGet', { token: token, path: '/api/nginx/certificates' }).then((before) => {
			cy.task('backendApiPut', {
				token:         userToken,
				path:          `/api/nginx/proxy-hosts/${hostId}`,
				data:          { certificate_id: 'new', advanced_config: 'return 418;' },
				returnOnError: true,
			}).then((data) => {
				expect(data).to.have.property('error');
				expect(data.error.code).to.equal(403);
				cy.task('backendApiGet', { token: token, path: '/api/nginx/certificates' }).then((after) => {
					expect(after.length).to.equal(before.length);
				});
			});
		});
	});

	it('Non-admin cannot add new location advanced config', () => {
		cy.task('backendApiPut', {
			token:         userToken,
			path:          `/api/nginx/proxy-hosts/${hostId}`,
			data:          { locations: [location('/api', ADMIN_CONFIG), location('/new', 'return 418;')] },
			returnOnError: true,
		}).then((data) => {
			expect(data).to.have.property('error');
			expect(data.error.code).to.equal(403);
		});
	});

	it('Non-admin can rename a location and keep its admin config', () => {
		cy.task('backendApiPut', {
			token: userToken,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
			data:  { locations: [location('/v2', ADMIN_CONFIG), location('/api', '')] },
		}).then((data) => {
			const byPath = Object.fromEntries(data.locations.map((l) => [l.path, l.advanced_config]));
			expect(byPath['/v2']).to.equal(ADMIN_CONFIG);
			expect(byPath['/api']).to.equal('');
		});
	});

	it('Non-admin can delete and re-add a location at the same path', () => {
		// The location form sends advanced_config "" for a new row
		cy.task('backendApiPut', {
			token: userToken,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
			data:  { locations: [location('/v2', '')] },
		}).then((data) => {
			expect(data.locations).to.have.length(1);
			expect(data.locations[0].advanced_config).to.equal('');
		});
	});

	it('Proxy host grants are cleared when proxy hosts are hidden', () => {
		// Unknown ids are dropped
		cy.task('backendApiPut', {
			token: token,
			path:  `/api/users/${userId}/permissions`,
			data:  { proxy_hosts: 'manage', meta: { proxy_host_ids: [hostId, 999999] } },
		});
		getPermissions().then((perms) => {
			expect(perms.meta.proxy_host_ids).to.deep.equal([hostId]);
		});

		cy.task('backendApiPut', {
			token: token,
			path:  `/api/users/${userId}/permissions`,
			data:  { proxy_hosts: 'hidden' },
		});
		getPermissions().then((perms) => {
			expect(perms.meta.proxy_host_ids).to.deep.equal([]);
		});

		// Showing proxy hosts again does not bring the old grant back
		cy.task('backendApiPut', {
			token: token,
			path:  `/api/users/${userId}/permissions`,
			data:  { proxy_hosts: 'manage' },
		});
		getPermissions().then((perms) => {
			expect(perms.meta.proxy_host_ids).to.deep.equal([]);
		});
	});

	it('Proxy host grants are cleared when visibility is all', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  `/api/users/${userId}/permissions`,
			data:  { visibility: 'all', proxy_hosts: 'manage', meta: { proxy_host_ids: [hostId] } },
		});
		getPermissions().then((perms) => {
			expect(perms.meta.proxy_host_ids).to.deep.equal([]);
		});
	});
});
