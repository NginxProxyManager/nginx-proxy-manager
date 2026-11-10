/// <reference types="cypress" />

// Values a non-admin can set are written into nginx config as-is. None of them may add
// directives (that is what advanced_config is for, and only admins may set it), but the valid
// forms people use, such as regex locations, must still produce a config nginx accepts.
describe('Values rendered into nginx config', () => {
	const user = {
		email:  'nginx-values@example.com',
		secret: 'changeme',
	};

	let token;
	let userToken;

	const location = (overrides) => Object.assign({
		path:            '/api',
		forward_scheme:  'http',
		forward_host:    '127.0.0.1',
		forward_port:    8080,
		advanced_config: '',
	}, overrides);

	const proxyHost = (domain, overrides) => Object.assign({
		domain_names:    [domain],
		forward_scheme:  'http',
		forward_host:    '127.0.0.1',
		forward_port:    80,
		access_list_id:  '0',
		certificate_id:  0,
		meta:            { dns_challenge: false },
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

	const expectRejected = (path, data) => {
		cy.task('backendApiPost', {
			token:         userToken,
			path:          path,
			data:          data,
			returnOnError: true,
		}).then((res) => {
			expect(res, JSON.stringify(data)).to.have.property('error');
			expect(res.error.code, JSON.stringify(data)).to.equal(400);
		});
	};

	const expectOnline = (path, id) => {
		cy.task('backendApiGet', {
			token: userToken,
			path:  `${path}/${id}`,
		}).then((row) => {
			expect(row.meta.nginx_err || null).to.equal(null);
			expect(row.meta.nginx_online).to.equal(true);
		});
	};

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/users',
				data:  {
					name:     'Nginx Values',
					nickname: 'Values',
					email:    user.email,
					roles:    [],
					auth:     { type: 'password', secret: user.secret },
				},
			}).then((created) => {
				cy.task('backendApiPut', {
					token: token,
					path:  `/api/users/${created.id}/permissions`,
					data:  {
						visibility:        'user',
						proxy_hosts:       'manage',
						redirection_hosts: 'manage',
						dead_hosts:        'manage',
						streams:           'manage',
						access_lists:      'manage',
						certificates:      'manage',
					},
				});
				cy.getToken(null, { identity: user.email, secret: user.secret }).then((tok2) => {
					userToken = tok2;
				});
			});
		});
	});

	it('Location paths and forward hosts that nginx accepts still work', () => {
		cy.task('backendApiPost', {
			token: userToken,
			path:  '/api/nginx/proxy-hosts',
			data:  proxyHost('nginx-values-ok.example.com', {
				locations: [
					location({ path: '= /exact' }),
					location({ path: '~* \\.(jpg|png|gif)$' }),
					location({ path: '^~ /static/' }),
					location({ path: '~ "^/v[0-9]{1,2}/"' }),
					location({ path: '/sub', forward_host: '127.0.0.1/sub/' }),
				],
			}),
		}).then((host) => {
			expectOnline('/api/nginx/proxy-hosts', host.id);
		});
	});

	it('Redirect targets with a port and path still work', () => {
		cy.task('backendApiPost', {
			token: userToken,
			path:  '/api/nginx/redirection-hosts',
			data:  {
				domain_names:        ['nginx-values-redirect.example.com'],
				forward_scheme:      'https',
				forward_http_code:   301,
				forward_domain_name: 'example.org:8443/landing',
				preserve_path:       true,
				certificate_id:      0,
				meta:                {},
				advanced_config:     '',
				block_exploits:      false,
				http2_support:       false,
				hsts_enabled:        false,
				hsts_subdomains:     false,
				ssl_forced:          false,
			},
		}).then((host) => {
			expectOnline('/api/nginx/redirection-hosts', host.id);
		});
	});

	it('Location path cannot add directives', () => {
		[
			'/x { return 200; } location /y',
			'/a; } server { listen 8080',
			'/a\nreturn 200 x;\nlocation /b',
			'/a {',
			'~',
		].forEach((path) => {
			expectRejected('/api/nginx/proxy-hosts', proxyHost('nginx-values-bad.example.com', {
				locations: [location({ path })],
			}));
		});
	});

	it('Forward hosts cannot add directives', () => {
		[
			'a; return 200; #',
			'a"; return 200; set $x "',
			'a:80; } location /x { return 200',
			'$http_host',
		].forEach((forward_host) => {
			expectRejected('/api/nginx/proxy-hosts', proxyHost('nginx-values-bad.example.com', { forward_host }));
			expectRejected('/api/nginx/proxy-hosts', proxyHost('nginx-values-bad.example.com', {
				locations: [location({ forward_host })],
			}));
		});
		expectRejected('/api/nginx/proxy-hosts', proxyHost('nginx-values-bad.example.com', {
			locations: [location({ forward_path: '/x; return 200' })],
		}));
	});

	it('Redirect target cannot add directives', () => {
		['example.com; return 200 x; #', 'a.com { return 200; }'].forEach((forward_domain_name) => {
			expectRejected('/api/nginx/redirection-hosts', {
				domain_names:      ['nginx-values-bad-redirect.example.com'],
				forward_scheme:    'http',
				forward_http_code: 301,
				forward_domain_name,
			});
		});
	});

	it('Stream forwarding host cannot add directives', () => {
		['a.com:80; } server { listen 9999', 'a.com/x'].forEach((forwarding_host) => {
			expectRejected('/api/nginx/streams', {
				incoming_port:   1600,
				forwarding_host,
				forwarding_port: 80,
				tcp_forwarding:  true,
				udp_forwarding:  false,
			});
		});
	});

	it('Domain names cannot add directives', () => {
		['a.example.com\nreturn 200 x', 'a\tb.example.com'].forEach((domain) => {
			expectRejected('/api/nginx/dead-hosts', { domain_names: [domain] });
		});
	});

	it('Access list entries cannot add directives or corrupt the password file', () => {
		['::1%x; allow all', '1.2.3.4; allow all', 'fe80::1%eth0'].forEach((address) => {
			expectRejected('/api/nginx/access-lists', {
				name:    'Bad client',
				items:   [],
				clients: [{ directive: 'deny', address }],
			});
		});
		['a:b', 'a\nroot:$apr1$x$y'].forEach((username) => {
			expectRejected('/api/nginx/access-lists', {
				name:    'Bad user',
				items:   [{ username, password: 'pw' }],
				clients: [],
			});
		});
	});
});
