/// <reference types="cypress" />

describe('Per-path Access Lists', () => {
	const domain = 'website3.example.com';

	const alpha = {
		name:     'Path Alpha',
		username: 'alpha-user',
		password: 'alpha-pass',
	};

	const beta = {
		name:     'Path Beta',
		username: 'beta-user',
		password: 'beta-pass',
	};

	let token;
	let alphaListId;
	let betaListId;
	let hostId;

	/**
	 * Requests a path on the proxy host directly (bypassing squid)
	 * and yields the HTTP status code and response body
	 *
	 * @param {string}  path
	 * @param {object}  [creds]
	 * @param {string}  creds.username
	 * @param {string}  creds.password
	 */
	const request = (path, creds) => {
		const auth = creds ? `-u '${creds.username}:${creds.password}'` : '';
		return cy.exec(`curl --noproxy '*' -s -w '\n%{http_code}' ${auth} http://${domain}${path}`)
			.then((result) => {
				expect(result.exitCode).to.eq(0);
				const lines = result.stdout.trim().split('\n');
				const status = lines.pop();
				return { status: status, body: lines.join('\n') };
			});
	};

	// nginx reloads are signalled and return immediately, so the old
	// config can still be served for a moment after an API change.
	// Retry until the expected response is seen.
	const waitForResponse = (path, creds, check, description) => {
		// Copy now, the callback runs later and creds may have been changed by then
		const credsCopy = creds ? { ...creds } : null;
		let last = null;
		cy.waitUntil(() => request(path, credsCopy).then((res) => {
			last = res;
			return check(res);
		}), {
			timeout:  15000,
			interval: 500,
			errorMsg: () => `${path} did not return ${description}, last status: ${last?.status}`,
		});
	};

	const expectStatus = (path, creds, status) => {
		waitForResponse(path, creds, (res) => res.status === status, status);
	};

	// Also checks the body so we know the page came from examplesite
	// and not the NPM default site
	const expectPage = (path, creds, text) => {
		waitForResponse(path, creds, (res) => res.status === '200' && res.body.includes(text), `200 with "${text}"`);
	};

	const createAccessList = (list) => {
		return cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/access-lists',
			data:  {
				name:        list.name,
				satisfy_any: false,
				pass_auth:   false,
				items:       [
					{
						username: list.username,
						password: list.password,
					}
				],
				clients: [],
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/access-lists', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			return cy.wrap(data.id);
		});
	};

	const location = (path, accessListId) => {
		return {
			path:           path,
			forward_scheme: 'http',
			forward_host:   'examplesite',
			forward_port:   80,
			access_list_id: accessListId,
		};
	};

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should be able to create multiple access lists with credentials', () => {
		createAccessList(alpha).then((id) => {
			alphaListId = id;
		});
		createAccessList(beta).then((id) => {
			betaListId = id;
			expect(betaListId).to.not.equal(alphaListId);
		});
	});

	it('Should be able to create a proxy host with a different access list per location', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data:  {
				domain_names:   [domain],
				forward_scheme: 'http',
				forward_host:   'examplesite',
				forward_port:   80,
				access_list_id: 0,
				certificate_id: 0,
				meta:           {
					dns_challenge: false
				},
				advanced_config: '',
				locations:       [
					location('/dashboard', alphaListId),
					location('/profile', betaListId),
				],
				block_exploits:          false,
				caching_enabled:         false,
				allow_websocket_upgrade: false,
				http2_support:           false,
				hsts_enabled:            false,
				hsts_subdomains:         false,
				ssl_forced:              false
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			hostId = data.id;
			expect(data).to.have.property('enabled', true);
			expect(data).to.have.property('access_list_id', 0);
			expect(data.locations).to.have.length(2);
			expect(data.locations[0]).to.have.property('access_list_id', alphaListId);
			expect(data.locations[1]).to.have.property('access_list_id', betaListId);
		});
	});

	it('Should persist the location access lists on the proxy host', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data.locations[0]).to.have.property('path', '/dashboard');
			expect(data.locations[0]).to.have.property('access_list_id', alphaListId);
			expect(data.locations[1]).to.have.property('path', '/profile');
			expect(data.locations[1]).to.have.property('access_list_id', betaListId);
		});
	});

	it('Should not require auth for the host root', () => {
		expectPage('/', null, 'this is the index page');
	});

	it('Should only accept the alpha credentials on /dashboard', () => {
		expectStatus('/dashboard', null, '401');
		expectStatus('/dashboard', beta, '401');
		expectPage('/dashboard', alpha, 'this is the dashboard page');
	});

	it('Should only accept the beta credentials on /profile', () => {
		expectStatus('/profile', null, '401');
		expectStatus('/profile', alpha, '401');
		expectPage('/profile', beta, 'this is the profile page');
	});

	it('Should apply access list credential changes to locations using it', () => {
		const newPassword = 'alpha-pass-changed';

		cy.task('backendApiPut', {
			token: token,
			path:  `/api/nginx/access-lists/${alphaListId}`,
			data:  {
				name:        alpha.name,
				satisfy_any: false,
				pass_auth:   false,
				items:       [
					{
						username: alpha.username,
						password: newPassword,
					}
				],
				clients: [],
			}
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/access-lists/{listID}', data);
			expect(data).to.have.property('id', alphaListId);
		});

		expectStatus('/dashboard', alpha, '401');
		expectPage('/dashboard', { username: alpha.username, password: newPassword }, 'this is the dashboard page');
		alpha.password = newPassword;

		// Other locations are unaffected
		expectStatus('/profile', null, '401');
		expectPage('/profile', beta, 'this is the profile page');
	});

	it('Should inherit the host access list on locations without their own', () => {
		// Host uses beta, /dashboard overrides with alpha, /missing has none and should inherit beta
		cy.task('backendApiPut', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
			data:  {
				access_list_id: betaListId,
				locations:      [
					location('/dashboard', alphaListId),
					location('/profile', betaListId),
					location('/missing', 0),
				],
			}
		}).then((data) => {
			// No swagger validation here: with a host access list set, the expanded
			// access_list in the response has no proxy_host_count, which the schema requires
			expect(data).to.have.property('access_list_id', betaListId);
			expect(data.locations[2]).to.have.property('access_list_id', 0);
		});

		expectStatus('/', null, '401');
		expectStatus('/', alpha, '401');
		expectPage('/', beta, 'this is the index page');

		// examplesite returns 404 for this path, once past the access list
		expectStatus('/missing', null, '401');
		expectStatus('/missing', alpha, '401');
		expectStatus('/missing', beta, '404');

		expectStatus('/dashboard', beta, '401');
		expectPage('/dashboard', alpha, 'this is the dashboard page');
	});

	it('Should remove a deleted access list from the host and locations using it', () => {
		cy.task('backendApiDelete', {
			token: token,
			path:  `/api/nginx/access-lists/${betaListId}`,
		}).then((data) => {
			cy.validateSwaggerSchema('delete', 200, '/nginx/access-lists/{listID}', data);
			expect(data).to.be.equal(true);
		});

		cy.task('backendApiGet', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
		}).then((data) => {
			expect(data).to.have.property('access_list_id', 0);
			expect(data.locations[0]).to.have.property('access_list_id', alphaListId);
			expect(data.locations[1]).to.have.property('access_list_id', 0);
			expect(data.locations[2]).to.have.property('access_list_id', 0);
		});

		expectPage('/', null, 'this is the index page');
		expectPage('/profile', null, 'this is the profile page');
		expectStatus('/missing', null, '404');

		// Remaining location access list must still be enforced
		expectStatus('/dashboard', null, '401');
		expectPage('/dashboard', alpha, 'this is the dashboard page');
	});

	it('Should be able to delete the proxy host and remaining access list', () => {
		cy.task('backendApiDelete', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
		}).then((data) => {
			cy.validateSwaggerSchema('delete', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data).to.be.equal(true);
		});

		cy.task('backendApiDelete', {
			token: token,
			path:  `/api/nginx/access-lists/${alphaListId}`,
		}).then((data) => {
			cy.validateSwaggerSchema('delete', 200, '/nginx/access-lists/{listID}', data);
			expect(data).to.be.equal(true);
		});
	});

});
