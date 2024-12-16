// Description: Constants used in the tests.

/**
 *  The default admin user is used to get tokens from the backend API to make requests.
 *  It is also used to create the test user.
 */
export const DEFAULT_ADMIN_EMAIL = Cypress.env('DEFAULT_ADMIN_EMAIL') || 'admin@example.com';
export const DEFAULT_ADMIN_PASSWORD =  Cypress.env('DEFAULT_ADMIN_PASSWORD') || 'changeme';

/**
 * The test user is created and deleted by the tests using `cy.createTestUser()` and `cy.deleteTestUser()`.
 */
export const TEST_USER_NAME = 'Robert Ross';
export const TEST_USER_NICKNAME = 'Bob';
export const TEST_USER_EMAIL = 'bob@ross.com';
export const TEST_USER_PASSWORD = 'changeme';
