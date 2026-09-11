/// <reference types="cypress" />

describe('Proxy Host gzip controls', () => {
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

	it('Keeps gzip enabled at level 1 when a client omits the new fields', () => {
		cy.task('backendApiPost', {
			token,
			path: '/api/nginx/proxy-hosts',
			data: {
				domain_names: ['gzip.example.com'],
				forward_scheme: 'http',
				forward_host: '127.0.0.1',
				forward_port: 8080,
				access_list_id: 0,
				certificate_id: 0,
				meta: {},
				locations: [],
			},
		}).then((data) => {
			proxyHostId = data.id;
			cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', data);
			expect(data).to.have.property('gzip_enabled', true);
			expect(data).to.have.property('gzip_comp_level', 1);
			expect(data).to.have.deep.property('gzip_types', []);
		});
	});

	it('Persists the compression level and additional MIME types', () => {
		cy.task('backendApiPut', {
			token,
			path: '/api/nginx/proxy-hosts/' + proxyHostId,
			data: { gzip_enabled: true, gzip_comp_level: 6, gzip_types: ['application/json', 'text/css'] },
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data).to.have.property('gzip_comp_level', 6);
			cy.task('backendApiGet', {
				token,
				path: '/api/nginx/proxy-hosts/' + proxyHostId,
			}).then((savedData) => {
				cy.validateSwaggerSchema('get', 200, '/nginx/proxy-hosts/{hostID}', savedData);
				expect(savedData).to.have.property('gzip_enabled', true);
				expect(savedData).to.have.property('gzip_comp_level', 6);
				expect(savedData).to.have.deep.property('gzip_types', ['application/json', 'text/css']);
				expect(savedData).to.have.nested.property('meta.nginx_online', true);
			});
		});
	});

	it('Can disable compression and clear the additional MIME types', () => {
		cy.task('backendApiPut', {
			token,
			path: '/api/nginx/proxy-hosts/' + proxyHostId,
			data: { gzip_enabled: false, gzip_types: [] },
		}).then((data) => {
			expect(data).to.have.property('gzip_enabled', false);
			expect(data).to.have.deep.property('gzip_types', []);
		});
	});

	for (const invalidSettings of [
		{ gzip_comp_level: 0 },
		{ gzip_comp_level: 10 },
		{ gzip_types: ['text/css; include /tmp/unsafe.conf'] },
	]) {
		it('Rejects unsafe gzip settings: ' + JSON.stringify(invalidSettings), () => {
			cy.task('backendApiPut', {
				token,
				path: '/api/nginx/proxy-hosts/' + proxyHostId,
				returnOnError: true,
				data: invalidSettings,
			}).then((data) => {
				expect(data).to.have.nested.property('error.message');
			});
		});
	}
});
