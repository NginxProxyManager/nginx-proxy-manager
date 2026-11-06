/// <reference types="cypress" />

describe('Tokens endpoints', () => {
	const user = {
		email:  'cypress@example.com',
		secret: 'changeme',
	};
	const disabledUser = {
		email:  'disabled@example.com',
		secret: 'changeme',
	};
	const unknownEmail = 'nobody@example.com';

	const login = (identity, secret) => {
		return cy.request({
			method:           'POST',
			url:              '/api/tokens',
			body:             {identity, secret},
			failOnStatusCode: false,
		});
	};

	before(() => {
		cy.resetUsers();
		cy.getToken().then((token) => {
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/users',
				data:  {
					name:        'Disabled User',
					nickname:    'Disabled',
					email:       disabledUser.email,
					is_disabled: true,
					auth:        {
						type:   'password',
						secret: disabledUser.secret,
					},
				},
			});
		});
	});

	it('Should give the same answer for an unknown email, a disabled account and a wrong password', () => {
		// Only the error is compared: CI runs the backend in debug mode, which adds a stack trace that a real
		// client never gets.
		login(user.email, 'not-the-password').then((wrongPassword) => {
			expect(wrongPassword.status).to.equal(400);
			expect(wrongPassword.body.error.message_i18n).to.equal('error.invalid-auth');

			login(unknownEmail, user.secret).then((unknown) => {
				expect(unknown.status).to.equal(wrongPassword.status);
				expect(unknown.body.error).to.deep.equal(wrongPassword.body.error);
			});

			login(disabledUser.email, disabledUser.secret).then((disabled) => {
				expect(disabled.status).to.equal(wrongPassword.status);
				expect(disabled.body.error).to.deep.equal(wrongPassword.body.error);
			});
		});
	});
});
