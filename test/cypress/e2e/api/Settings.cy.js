/// <reference types="cypress" />

describe('Settings endpoints', () => {
	let token;

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Get all settings', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/settings',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/settings', data);
			expect(data.length).to.be.greaterThan(0);
		});
	});

	it('Get default-site setting', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/settings/default-site',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.equal('default-site');
		});
	});

	it('Default Site congratulations', function() {
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

	it('Default Site 404', function() {
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

	it('Default Site 444', function() {
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

	it('Default Site redirect', function() {
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

	it('Default Site html', function() {
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
});
