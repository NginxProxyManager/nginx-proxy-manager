/// <reference types="cypress" />

describe('Real IP Header setting endpoints', () => {
	let token;

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should include real-ip-header in all settings', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/settings',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/settings', data);
			const realIpSetting = data.find((s) => s.id === 'real-ip-header');
			expect(realIpSetting).to.not.be.undefined;
			expect(realIpSetting).to.have.property('value', 'X-Real-IP');
		});
	});

	it('Should get real-ip-header setting', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/settings/real-ip-header',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('id', 'real-ip-header');
			expect(data).to.have.property('value', 'X-Real-IP');
			expect(data).to.have.property('name', 'Real IP Header');
		});
	});

	it('Should set real-ip-header to X-Real-IP', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/settings/real-ip-header',
			data: {
				value: 'X-Real-IP',
				meta:  {},
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('id', 'real-ip-header');
			expect(data).to.have.property('value', 'X-Real-IP');
		});
	});

	it('Should set real-ip-header to CF-Connecting-IP', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/settings/real-ip-header',
			data: {
				value: 'CF-Connecting-IP',
				meta:  {},
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('id', 'real-ip-header');
			expect(data).to.have.property('value', 'CF-Connecting-IP');
		});
	});

	it('Should set real-ip-header to X-Forwarded-For', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/settings/real-ip-header',
			data: {
				value: 'X-Forwarded-For',
				meta:  {},
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('id', 'real-ip-header');
			expect(data).to.have.property('value', 'X-Forwarded-For');
		});
	});

	it('Should set real-ip-header to custom value', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/settings/real-ip-header',
			data: {
				value: 'custom',
				meta: {
					custom: 'True-Client-IP',
				},
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('id', 'real-ip-header');
			expect(data).to.have.property('value', 'custom');
			expect(data).to.have.property('meta');
			expect(data.meta).to.have.property('custom', 'True-Client-IP');
		});
	});

	it('Should persist the value after re-reading', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/settings/real-ip-header',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('value', 'custom');
			expect(data.meta).to.have.property('custom', 'True-Client-IP');
		});
	});

	it('Should reset back to X-Real-IP', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/settings/real-ip-header',
			data: {
				value: 'X-Real-IP',
				meta:  {},
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/settings/{settingID}', data);
			expect(data).to.have.property('value', 'X-Real-IP');
		});
	});
});
