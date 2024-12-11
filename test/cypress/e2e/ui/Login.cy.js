/// <reference types="cypress" />

import {TEST_USER_EMAIL, TEST_USER_NICKNAME, TEST_USER_PASSWORD} from "../../support/constants";

describe('Login', () => {
    beforeEach(() => {
        // Clear all cookies and local storage so we start fresh
        cy.clearCookies();
        cy.clearLocalStorage();
    });

    describe('when OIDC is not enabled', () => {
        beforeEach(() => {
            cy.configureOidc(false);
            cy.visit('/');
        })

        it('should show the login form', () => {
            cy.get('input[data-cy="identity"]').should('exist');
            cy.get('input[data-cy="password"]').should('exist');
            cy.get('button[data-cy="sign-in"]').should('exist');
        });

        it('should NOT show the button to sign in with an identity provider', () => {
            cy.get('button[data-cy="oidc-login"]').should('not.exist');
        });

        describe('logging in with a username and password', () => {
            // These tests are duplicated below. The difference is that OIDC is disabled here.
            beforeEach(() => {
                // Delete and recreate the test user
                cy.deleteTestUser();
                cy.createTestUser();
            });

            it('should log the user in when the credentials are correct', () => {
                // Fill in the form with the test user's email and the correct password
                cy.get('input[data-cy="identity"]').type(TEST_USER_EMAIL);
                cy.get('input[data-cy="password"]').type(TEST_USER_PASSWORD);

                // Intercept the POST request to /api/tokens, so we can wait for it to complete before proceeding
                cy.intercept('POST', '/api/tokens').as('login');

                // Click the sign-in button
                cy.get('button[data-cy="sign-in"]').click();
                cy.wait('@login');

                // Expect a 200 from the backend
                cy.get('@login').its('response.statusCode').should('eq', 200);

                // Expect the user to be redirected to the dashboard with a welcome message
                cy.get('h1[data-cy="page-title"]').should('contain.text', `Hi ${TEST_USER_NICKNAME}`);
            });

            it('should show an error message if the password is incorrect', () => {
                // Fill in the form with the test user's email and an incorrect password
                cy.get('input[data-cy="identity"]').type(TEST_USER_EMAIL);
                cy.get('input[data-cy="password"]').type(`${TEST_USER_PASSWORD}_obviously_not_correct`);

                // Intercept the POST request to /api/tokens, so we can wait for it to complete before checking the error message
                cy.intercept('POST', '/api/tokens').as('login');

                // Click the sign-in button
                cy.get('button[data-cy="sign-in"]').click();
                cy.wait('@login');

                // Expect a 401 from the backend
                cy.get('@login').its('response.statusCode').should('eq', 401);
                // Expect an error message on the UI
                cy.get('div[data-cy="password-error"]').should('contain.text', 'Invalid password');
            });

            it('should show an error message if the email is incorrect', () => {
                // Fill in the form with the test user's email and an incorrect password
                cy.get('input[data-cy="identity"]').type(`definitely_not_${TEST_USER_EMAIL}`);
                cy.get('input[data-cy="password"]').type(TEST_USER_PASSWORD);

                // Intercept the POST request to /api/tokens, so we can wait for it to complete before checking the error message
                cy.intercept('POST', '/api/tokens').as('login');

                // Click the sign-in button
                cy.get('button[data-cy="sign-in"]').click();
                cy.wait('@login');

                // Expect a 401 from the backend
                cy.get('@login').its('response.statusCode').should('eq', 401);
                // Expect an error message on the UI
                cy.get('div[data-cy="password-error"]').should('contain.text', 'No relevant user found');
            });
        });
    });

    describe('when OIDC is enabled', () => {
        beforeEach(() => {
            cy.configureOidc(true);
            cy.visit('/');
        });

        it('should show the login form', () => {
            cy.get('input[data-cy="identity"]').should('exist');
            cy.get('input[data-cy="password"]').should('exist');
            cy.get('button[data-cy="sign-in"]').should('exist');
        });

        it('should show the button to sign in with the configured identity provider', () => {
            cy.get('button[data-cy="oidc-login"]').should('exist');
            cy.get('button[data-cy="oidc-login"]').should('contain.text', 'Sign in with ACME OIDC Provider');
        });

        describe('logging in with a username and password', () => {
            // These tests are the same as the ones above, but we need to repeat them here because the OIDC configuration
            beforeEach(() => {
                // Delete and recreate the test user
                cy.deleteTestUser();
                cy.createTestUser();
            });

            it('should log the user in when the credentials are correct', () => {
                // Fill in the form with the test user's email and the correct password
                cy.get('input[data-cy="identity"]').type(TEST_USER_EMAIL);
                cy.get('input[data-cy="password"]').type(TEST_USER_PASSWORD);

                // Intercept the POST request to /api/tokens, so we can wait for it to complete before proceeding
                cy.intercept('POST', '/api/tokens').as('login');

                // Click the sign-in button
                cy.get('button[data-cy="sign-in"]').click();
                cy.wait('@login');

                // Expect a 200 from the backend
                cy.get('@login').its('response.statusCode').should('eq', 200);

                // Expect the user to be redirected to the dashboard with a welcome message
                cy.get('h1[data-cy="page-title"]').should('contain.text', `Hi ${TEST_USER_NICKNAME}`);

            });

            it('should show an error message if the password is incorrect', () => {
                // Fill in the form with the test user's email and an incorrect password
                cy.get('input[data-cy="identity"]').type(TEST_USER_EMAIL);
                cy.get('input[data-cy="password"]').type(`${TEST_USER_PASSWORD}_obviously_not_correct`);

                // Intercept the POST request to /api/tokens, so we can wait for it to complete before checking the error message
                cy.intercept('POST', '/api/tokens').as('login');

                // Click the sign-in button
                cy.get('button[data-cy="sign-in"]').click();
                cy.wait('@login');

                // Expect a 401 from the backend
                cy.get('@login').its('response.statusCode').should('eq', 401);
                // Expect an error message on the UI
                cy.get('div[data-cy="password-error"]').should('contain.text', 'Invalid password');
            });

            it('should show an error message if the email is incorrect', () => {
                // Fill in the form with the test user's email and an incorrect password
                cy.get('input[data-cy="identity"]').type(`definitely_not_${TEST_USER_EMAIL}`);
                cy.get('input[data-cy="password"]').type(TEST_USER_PASSWORD);

                // Intercept the POST request to /api/tokens, so we can wait for it to complete before checking the error message
                cy.intercept('POST', '/api/tokens').as('login');

                // Click the sign-in button
                cy.get('button[data-cy="sign-in"]').click();
                cy.wait('@login');

                // Expect a 401 from the backend
                cy.get('@login').its('response.statusCode').should('eq', 401);
                // Expect an error message on the UI
                cy.get('div[data-cy="password-error"]').should('contain.text', 'No relevant user found');
            });
        });

        describe('logging in with OIDC', () => {
           beforeEach(() => {
                // Delete and recreate the test user
                cy.deleteTestUser();
                cy.createTestUser();
           });

           // TODO: Create a dummy OIDC provider that we can use for testing so we can test this fully.
        });
    });
});
