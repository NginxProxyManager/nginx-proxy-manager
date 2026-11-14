/// <reference types="cypress" />

// POST /api/nginx/regenerate rewrites every enabled host's config from the database and reloads nginx once
describe('Regenerate all host configs', () => {
	// Network aliases of the fullstack container, requests carry this Host header
	const domain = 'website3.example.com';
	const deadDomain = 'website4.example.com';

	let token;
	let hostId;
	let deadHostId;

	const proxyHost = (domainName, extra) => {
		return Object.assign({
			domain_names:            [domainName],
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
			ssl_forced:              false
		}, extra || {});
	};

	const request = (host) => {
		return cy.task('exec', { command: `curl --noproxy '*' -s -o /dev/null -w '%{http_code}' -H 'Host: ${host}' http://fullstack/` }, { log: false })
			.then((result) => result.stdout.trim());
	};

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/proxy-hosts',
				data:  proxyHost(domain),
			}).then((data) => {
				hostId = data.id;
			});
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/dead-hosts',
				data:  { domain_names: [deadDomain] },
			}).then((data) => {
				deadHostId = data.id;
				expect(data.meta).to.have.property('nginx_online', true);
			});
		});
	});

	it('Should regenerate all hosts and report the result', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/regenerate',
			data:  {},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/nginx/regenerate', data);
			expect(data.checked).to.be.at.least(2);
			expect(data.regenerated).to.be.at.least(2);
			expect(data.offline).to.be.an('array');
			expect(data.failed).to.have.length(0);
			expect(data.duration_ms).to.be.a('number');
			expect(data.warnings).to.be.an('array');
			const problems = [...data.offline, ...data.warnings];
			expect(problems.map((h) => `${h.host_type}:${h.id}`)).not.to.include(`proxy_host:${hostId}`);
			expect(problems.map((h) => `${h.host_type}:${h.id}`)).not.to.include(`dead_host:${deadHostId}`);
		});

		// Still served after the reload
		cy.waitUntil(() => request(domain).then((status) => status === '200'), {
			timeout:  15000,
			interval: 500,
		});
	});

	it('Should keep the hosts online and their status fresh', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
		}).then((data) => {
			expect(data.meta).to.have.property('nginx_online', true);
			expect(data.meta).to.have.property('nginx_err', null);
		});
		cy.task('backendApiGet', {
			token: token,
			path:  `/api/nginx/dead-hosts/${deadHostId}`,
		}).then((data) => {
			expect(data.meta).to.have.property('nginx_online', true);
			expect(data.meta).to.have.property('nginx_err', null);
		});
	});

	it('Should only regenerate the requested host types', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/regenerate',
			data:  { host_types: ['dead_host'] },
		}).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/nginx/regenerate', data);
			expect(data.checked).to.be.at.least(1);
			expect(data.failed).to.have.length(0);
			// the selection: what was regenerated or failed. `offline` may also list hosts of other types that the
			// final test took offline (see summariseFinal() in backend/lib/nginx-regenerate.js), so it is not checked here
			const types = [...data.failed, ...data.warnings].map((h) => h.host_type);
			types.forEach((type) => expect(type).to.equal('dead_host'));
		});

		cy.task('backendApiPost', {
			token:         token,
			path:          '/api/nginx/regenerate',
			data:          { host_types: ['nope'] },
			returnOnError: true,
		}).then((data) => {
			expect(data.error.code).to.equal(400);
		});
	});

	it('Should write an audit log entry', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/audit-log',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/audit-log', data);
			const entry = data.find((e) => e.object_type === 'nginx-config' && e.action === 'regenerated');
			expect(entry).to.not.equal(undefined);
			expect(entry.object_id).to.equal(0);
			expect(entry.meta).to.have.property('checked');
		});
	});

	it('Should answer regenerations sent at once with 200 or 409', () => {
		// Two requests at once, straight to the API: when they overlap, one runs and the other one gets a 409.
		// They may not overlap (both wait for the auth checks first, a run of two hosts is short), so this tries a
		// few pairs, stops at the first 409 and accepts two 200s as well: every pair needs at least one 200 and
		// nothing but 200 or 409. The 409 itself is tested deterministically with a held run in
		// backend/test/nginx-regenerate-busy.test.js.
		const curl = `curl --noproxy '*' -s -o /dev/null -w '%{http_code}\\n' -X POST -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '{}' ${Cypress.config('baseUrl')}/api/nginx/regenerate`;
		const attempt = (n) => {
			const out = `/tmp/regen-${Date.now()}-${n}`;
			return cy.task('exec', {
				command: `${curl} > ${out}-a.txt & ${curl} > ${out}-b.txt & wait ; cat ${out}-a.txt ${out}-b.txt ; rm -f ${out}-a.txt ${out}-b.txt`,
			}, { log: false, timeout: 120000 }).then((result) => {
				const codes = result.stdout.trim().split('\n').sort();
				expect(codes).to.have.length(2);
				codes.forEach((code) => expect(code).to.be.oneOf(['200', '409']));
				// one of them always runs
				expect(codes).to.include('200');
				if (codes.includes('409') || n >= 5) {
					return codes;
				}
				return attempt(n + 1);
			});
		};
		attempt(1).then((codes) => {
			expect(codes.join(',')).to.be.oneOf(['200,200', '200,409']);
		});
	});

	it('Should be admin only', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/users',
			data:  {
				name:     'Regenerate User',
				nickname: 'regen',
				email:    'regenerate@example.com',
				roles:    ['user'],
				auth:     { type: 'password', secret: 'changeme' },
			},
		}).then(() => {
			cy.getToken(null, { identity: 'regenerate@example.com', secret: 'changeme' }).then((userToken) => {
				cy.task('backendApiPost', {
					token:         userToken,
					path:          '/api/nginx/regenerate',
					data:          {},
					returnOnError: true,
				}).then((data) => {
					expect(data.error.code).to.equal(403);
				});
			});
		});
	});

	after(() => {
		if (hostId) {
			cy.task('backendApiDelete', { token: token, path: `/api/nginx/proxy-hosts/${hostId}` });
		}
		if (deadHostId) {
			cy.task('backendApiDelete', { token: token, path: `/api/nginx/dead-hosts/${deadHostId}` });
		}
	});
});
