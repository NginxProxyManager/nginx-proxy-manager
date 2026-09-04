/// <reference types="cypress" />

describe('Proxy Host asset cache lifetime', () => {
	let token;
	let proxyHostId;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((value) => {
			token = value;
		});
	});

	after(() => {
		if (proxyHostId) {
			cy.task('backendApiDelete', { token, path: '/api/nginx/proxy-hosts/' + proxyHostId });
		}
	});

	it('Keeps the 30-minute default when a client omits the new field', () => {
		cy.task('backendApiPost', {
			token,
			path: '/api/nginx/proxy-hosts',
			data: {
				domain_names: ['asset-cache.example.com'],
				forward_scheme: 'http',
				forward_host: '127.0.0.1',
				forward_port: 8080,
				access_list_id: 0,
				certificate_id: 0,
				meta: {},
				locations: [],
				caching_enabled: false,
			},
		}).then((data) => {
			proxyHostId = data.id;
			cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', data);
			expect(data).to.have.property('asset_cache_ttl', 1800);
		});
	});

	it('Persists a custom cache lifetime across updates and reads', () => {
		cy.task('backendApiPut', {
			token,
			path: '/api/nginx/proxy-hosts/' + proxyHostId,
			data: { caching_enabled: true, asset_cache_ttl: 86400 },
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data).to.have.property('asset_cache_ttl', 86400);
			cy.task('backendApiGet', {
				token,
				path: '/api/nginx/proxy-hosts/' + proxyHostId,
			}).then((savedData) => {
				cy.validateSwaggerSchema('get', 200, '/nginx/proxy-hosts/{hostID}', savedData);
				expect(savedData).to.have.property('caching_enabled', true);
				expect(savedData).to.have.property('asset_cache_ttl', 86400);
				expect(savedData).to.have.nested.property('meta.nginx_online', true);
			});
		});
	});

	for (const invalidTtl of [0, 31536001, 1.5, '1h; include /tmp/unsafe.conf']) {
		it('Rejects an invalid cache lifetime: ' + invalidTtl, () => {
			cy.task('backendApiPut', {
				token,
				path: '/api/nginx/proxy-hosts/' + proxyHostId,
				returnOnError: true,
				data: { asset_cache_ttl: invalidTtl },
			}).then((data) => {
				expect(data).to.have.nested.property('error.message');
			});
		});
	}
});
