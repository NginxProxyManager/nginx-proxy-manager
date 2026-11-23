/// <reference types="cypress" />

// Proxy host suggestions from Docker labels (npm.domain, npm.port, ...) in GET /api/upstreams/candidates.
//
// Docker discovery is opt-in. Without it (the default CI stack) the spec checks that no suggestions are
// returned. With NPM_DOCKER_DISCOVERY=true and a Docker API that lists a container labelled
// npm.domain=labels-blog.example.com (as in the e2e fixture), it also checks the suggestion the forward host
// picker fills into a new proxy host, and the existing-host marks it shows.
describe('Docker label suggestions', () => {
	let token;
	const fixtureDomain = 'labels-blog.example.com';

	const getCandidates = (tok = token) => {
		return cy.task('backendApiGet', {
			token: tok,
			path:  '/api/upstreams/candidates',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/upstreams/candidates', data);
			return cy.wrap(data);
		});
	};

	const withSuggestion = (data) => data.items.filter((item) => item.suggestion);
	// the fixture container's own item (its compose service alias carries the same suggestion)
	const labelledContainer = (data) => withSuggestion(data).find(
		(i) => i.kind === 'container' && i.suggestion.domain_names.includes(fixtureDomain)
	);

	const hostBody = (s) => ({
		domain_names:            s.domain_names,
		forward_scheme:          s.forward_scheme,
		forward_host:            s.forward_host,
		forward_port:            s.forward_port || 80,
		allow_websocket_upgrade: s.allow_websocket_upgrade,
		block_exploits:          s.block_exploits,
		caching_enabled:         s.caching_enabled,
		http2_support:           s.http2_support,
		access_list_id:          0,
		certificate_id:          0,
		meta:                    {dns_challenge: false},
		advanced_config:         '',
		locations:               [],
		hsts_enabled:            false,
		hsts_subdomains:         false,
		ssl_forced:              false
	});

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should only suggest proxy hosts for Docker API containers', () => {
		getCandidates().then((data) => {
			const suggested = withSuggestion(data);
			for (const item of suggested) {
				expect(item.source).to.equal('docker');
				expect(item.kind).to.be.oneOf(['container', 'compose_service']);
				// a compose service alias names its container, a container has no owner
				if (item.kind === 'compose_service') {
					expect(item.owner).to.be.a('string');
				} else {
					expect(item.owner).to.equal(null);
				}
				const s = item.suggestion;
				expect(s.forward_host).to.equal(item.host);
				expect(s.forward_scheme).to.be.oneOf(['http', 'https']);
				expect(s.domain_names).to.be.an('array');
				for (const domain of s.domain_names) {
					expect(domain).to.equal(domain.toLowerCase());
					// at most a single leading "*." wildcard, never "*.com"
					expect(domain.replace(/^\*\./, '')).not.to.include('*');
					expect(domain.replace(/^\*\./, '')).to.include('.');
				}
				expect(s.ignored_domains).to.be.an('array');
				expect(s.existing_host_type).to.be.oneOf([null, 'proxy_host', 'redirection_host', 'dead_host']);
			}
			if (data.providers.docker.status !== 'ok') {
				expect(suggested).to.have.length(0);
			}
		});
	});

	it('Should mark a suggestion once a proxy host uses its domain', () => {
		getCandidates().then((data) => {
			const item = labelledContainer(data);
			if (data.providers.docker.status !== 'ok' || !item) {
				cy.log('Docker discovery with the label fixture is not running, skipping the label flow');
				return;
			}

			// The fixture's labels: npm.domain "Labels-Blog.example.com, www.labels-blog.example.com, *.labels-blog.example.com,
			// *.com, bad!.example.com", npm.port 80, npm.websocket true, npm.block_exploits yes, npm.caching off, npm.http2 maybe
			const s = item.suggestion;
			expect(s.domain_names).to.deep.equal([fixtureDomain, `www.${fixtureDomain}`, `*.${fixtureDomain}`]);
			expect(s.ignored_domains).to.deep.equal(['*.com', 'bad!.example.com']);
			expect(s.forward_port).to.equal(80);
			expect(s.allow_websocket_upgrade).to.equal(true);
			expect(s.block_exploits).to.equal(true);
			expect(s.caching_enabled).to.equal(false);
			expect(s.http2_support).to.equal(false);
			expect(s.existing_host_id).to.equal(null);
			expect(s.existing_host_type).to.equal(null);

			// The compose service alias of the same container carries the same suggestion, aimed at the alias
			for (const alias of data.items.filter((i) => i.kind === 'compose_service' && i.owner === item.host)) {
				expect(alias.suggestion).to.deep.equal({ ...s, forward_host: alias.host });
			}

			// What the picker fills in is a valid proxy host body
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/proxy-hosts',
				data:  hostBody(s),
			}).then((host) => {
				cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', host);
				// the backend stores domain names sorted
				expect(host.domain_names).to.deep.equal([...s.domain_names].sort());
				expect(host.forward_host).to.equal(s.forward_host);
				expect(host.allow_websocket_upgrade).to.equal(true);

				getCandidates().then((after) => {
					const again = withSuggestion(after).find((i) => i.host === item.host);
					expect(again.suggestion.existing_host_id).to.equal(host.id);
					expect(again.suggestion.existing_host_type).to.equal('proxy_host');
				});

				cy.task('backendApiDelete', {
					token: token,
					path:  `/api/nginx/proxy-hosts/${host.id}`,
				}).then(() => {
					getCandidates().then((after) => {
						const again = withSuggestion(after).find((i) => i.host === item.host);
						expect(again.suggestion.existing_host_id).to.equal(null);
					});
				});
			});
		});
	});

	it('Should report a redirection host that already uses a label domain', () => {
		getCandidates().then((data) => {
			const item = labelledContainer(data);
			if (data.providers.docker.status !== 'ok' || !item) {
				cy.log('Docker discovery with the label fixture is not running, skipping');
				return;
			}
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/redirection-hosts',
				data:  {
					domain_names:        [`www.${fixtureDomain}`],
					forward_scheme:      'https',
					forward_http_code:   301,
					forward_domain_name: 'example.com',
					preserve_path:       true,
					block_exploits:      false,
					certificate_id:      0,
					ssl_forced:          false,
					hsts_enabled:        false,
					hsts_subdomains:     false,
					meta:                {dns_challenge: false},
					advanced_config:     '',
				},
			}).then((redirect) => {
				getCandidates().then((after) => {
					const again = withSuggestion(after).find((i) => i.host === item.host);
					expect(again.suggestion.existing_host_id).to.equal(redirect.id);
					expect(again.suggestion.existing_host_type).to.equal('redirection_host');
				});
				cy.task('backendApiDelete', {
					token: token,
					path:  `/api/nginx/redirection-hosts/${redirect.id}`,
				});
			});
		});
	});

	it('Should not point other users at hosts they cannot see', () => {
		getCandidates().then((data) => {
			const item = labelledContainer(data);
			if (data.providers.docker.status !== 'ok' || !item) {
				cy.log('Docker discovery with the label fixture is not running, skipping');
				return;
			}
			const email = 'labels-user@example.com';
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/proxy-hosts',
				data:  hostBody(item.suggestion),
			}).then((host) => {
				cy.task('backendApiPost', {
					token: token,
					path:  '/api/users',
					data:  {
						name:     email,
						nickname: 'labels',
						email:    email,
						roles:    ['user'],
						auth:     {type: 'password', secret: 'changeme'},
					},
				}).then((user) => {
					cy.task('backendApiPut', {
						token: token,
						path:  `/api/users/${user.id}/permissions`,
						data:  {visibility: 'user', proxy_hosts: 'manage'},
					}).then(() => {
						cy.getToken(null, {identity: email, secret: 'changeme'}).then((userToken) => {
							getCandidates(userToken).then((seen) => {
								const own = withSuggestion(seen).find((i) => i.host === item.host);
								expect(own.suggestion.existing_host_id).to.equal(null);
							});
						});
					});
				});
				cy.task('backendApiDelete', {
					token: token,
					path:  `/api/nginx/proxy-hosts/${host.id}`,
				});
			});
		});
	});
});
