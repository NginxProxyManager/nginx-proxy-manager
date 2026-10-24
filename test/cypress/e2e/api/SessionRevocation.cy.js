/// <reference types="cypress" />

describe('SSO session revocation boundaries', () => {
	let adminToken;
	let connectionID;
	let disabledToken;
	const validOnSecond = (token) => cy.task('backendApiGet', {baseUrl:'http://127.0.0.1:3082',token,path:'/api/users/me'}, {log:false}).its('result.email').should('equal','allowed@example.com');
	const storedToken = () => cy.window().should((win) => {
		expect(win.localStorage.getItem('authentications')).to.be.a('string');
	}).then((win) => JSON.parse(win.localStorage.getItem('authentications'))[0].token);

	const loginThroughOIDC = () => {
		cy.clearLocalStorage();
		cy.visit('/login');
		cy.contains('Fixture OIDC').click();
		return storedToken();
	};

	before(() => {
		cy.requireSSOEnvironment();
		cy.task('backendApiPost', {
			path: '/api/auth',
			data: {type: 'local', identity: 'cypress@example.com', secret: 'changeme'},
		}).then(({result: auth}) => {
			adminToken = auth.token;
			cy.ssoAdminApi('get', '/connections', adminToken).then(({result}) => {
				connectionID = result.find((item) => item.name === 'Fixture OIDC')?.id;
				expect(connectionID, 'Fixture OIDC connection').to.be.a('string');
			});
		});
	});

	it('revokes an SSO session when its shared email is removed and re-add does not revive it', () => {
		loginThroughOIDC().then((sessionToken) => validOnSecond(sessionToken).then(() => cy.ssoAdminApi('get', '/allowlist', adminToken)).then(({result}) => {
			return cy.ssoAdminApi('put', '/allowlist', adminToken, {revision: result.revision, emails: []}).then(({result: removed}) => {
				return cy.task('backendApiGet', {baseUrl: 'http://127.0.0.1:3082', token: sessionToken, path: '/api/users/me', returnOnError: true})
					.its('error.code').should('equal', 401);
			}).then(() => cy.ssoAdminApi('get', '/allowlist', adminToken)).then(({result: current}) =>
				cy.ssoAdminApi('put', '/allowlist', adminToken, {revision: current.revision, emails: ['allowed@example.com']})).then(() => {
					cy.task('backendApiGet', {token: sessionToken, path: '/api/users/me', returnOnError: true})
						.its('error.code').should('equal', 401);
			});
		}));
	});

	it('revokes across the second backend on a sensitive edit without affecting local login', () => {
		loginThroughOIDC().then((token) => validOnSecond(token).then(() => cy.ssoAdminApi('get', `/connections/${connectionID}`, adminToken)).then(({result}) =>
			cy.ssoAdminApi('put', `/connections/${connectionID}`, adminToken, {
				revision: result.revision, protocol: result.protocol, name: result.name,
				enabled: result.enabled, config: result.config,
				secret_action: 'replace', secret_value: 'oidc-secret',
			})).then(() => cy.task('backendApiGet', {
			baseUrl: 'http://127.0.0.1:3082', token, path: '/api/users/me', returnOnError: true,
		})).its('error.code').should('equal', 401).then(() => cy.task('backendApiGet', {
			token: adminToken, path: '/api/users/me',
		})).its('result.email').should('equal', 'cypress@example.com'));
	});

	it('display-name edit preserves a session but disabling its provider revokes it', () => {
		loginThroughOIDC().then((token) => cy.ssoAdminApi('get', `/connections/${connectionID}`, adminToken).then(({result}) => {
			disabledToken=token;
			cy.ssoAdminApi('put', `/connections/${connectionID}`, adminToken, {
				revision: result.revision, protocol: result.protocol, enabled: result.enabled, config: result.config,
				name: `${result.name} renamed`, secret_action: 'keep',
			}).then(({result: renamed}) => {
				validOnSecond(token);
				cy.ssoAdminApi('put', `/connections/${connectionID}`, adminToken, {
					revision: renamed.revision, protocol: renamed.protocol, name: renamed.name,
					enabled: false, config: renamed.config, secret_action: 'keep',
				}).then(() => cy.task('backendApiGet', {token, path: '/api/users/me', returnOnError: true})
					.its('error.code').should('equal', 401));
			});
		}));
	});

	it('fences two browser sessions, refresh, derived SSE and impersonation across both instances', () => {
		let first, second, child, derived, accountID, sessionID;
		const remote = 'http://127.0.0.1:3082';
		const postRemote = (token,path,data={}) => cy.task('backendApiPost', {baseUrl:remote,token,path,data,returnOnError:true}, {log:false});
		const deniedProfile = (token) => cy.task('backendApiGet', {baseUrl:remote,token,path:'/api/users/me',returnOnError:true}, {log:false}).its('error.code').should('equal',401);
		// The preceding disable case must not revive old credentials when enabled.
		cy.ssoAdminApi('get', `/connections/${connectionID}`, adminToken).then(({result}) =>
			cy.ssoAdminApi('put', `/connections/${connectionID}`, adminToken, {revision:result.revision,protocol:result.protocol,config:result.config,name:'Fixture OIDC',enabled:true,secret_action:'keep'}));
		cy.then(() => deniedProfile(disabledToken));
		loginThroughOIDC().then((token) => {
			first=token;
			return cy.task('backendApiGet',{token,path:'/api/users/me'}, {log:false});
		}).then(({result}) => {
			accountID=result.id;
			return cy.task('backendApiPut',{token:adminToken,path:`/api/users/${accountID}`,data:{capabilities:['full-admin']}}, {log:false});
		}).then(() => loginThroughOIDC()).then((token) => {
			second=token;
			validOnSecond(first); validOnSecond(second);
			return postRemote(first,'/api/auth/refresh');
		}).its('result.token').should('be.a','string').then(() =>
			postRemote(first,`/api/users/${accountID}/login`)).then(({result}) => {
			child=result.token;
			expect(child).to.be.a('string');
			return postRemote(second,'/api/auth/sse');
		}).then(({result}) => {
			derived=result.token;
			sessionID=JSON.parse(atob(derived.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sid;
			return cy.task('ssoSSEOpen',{id:'remote-revocation',token:derived}, {log:false});
		}).then(() => postRemote(adminToken,'/api/sse-notification',{type:'info',lang:'runtime-before-revoke'}))
			.then(() => cy.task('ssoSSEEvidence',{id:'remote-revocation',waitForText:'runtime-before-revoke'}))
			.its('text').should('contain','runtime-before-revoke')
			.then(() => postRemote(adminToken,'/api/sse-notification',{test_delivery_gate:{session_id:sessionID,action:'pause'}}))
			.then(() => postRemote(adminToken,'/api/sse-notification',{type:'info',lang:'runtime-queued-before-revoke'}))
			.then(() => cy.task('ssoWaitForDeliveryGate',{token:adminToken,sessionID},{log:false}))
			.then(() => cy.ssoAdminApi('get','/allowlist',adminToken)).then(({result}) =>
				cy.ssoAdminApi('put','/allowlist',adminToken,{revision:result.revision,emails:[]}))
			.then(() => postRemote(adminToken,'/api/sse-notification',{test_delivery_gate:{session_id:sessionID,action:'release'}}))
			.then(() => {
				deniedProfile(first); deniedProfile(second); deniedProfile(child);
				for (const token of [first,second,child]) postRemote(token,'/api/auth/refresh').its('error.code').should('equal',401);
				postRemote(first,'/api/auth/logout').its('error.code').should('equal',401);
				cy.request({url:`${remote}/api/sse?jwt=${encodeURIComponent(derived)}`,failOnStatusCode:false,log:false}).its('status').should('equal',401);
				postRemote(adminToken,'/api/sse-notification',{type:'info',lang:'runtime-after-revoke'});
				cy.task('ssoSSEEvidence',{id:'remote-revocation',waitForClose:true}).then(({text,closed}) => {
					expect(closed).to.equal(true);
					expect(text).not.to.contain('runtime-after-revoke');
					expect(text).not.to.contain('runtime-queued-before-revoke');
				});
				cy.task('ssoSSEClose',{id:'remote-revocation'});
			}).then(() => cy.ssoAdminApi('get','/allowlist',adminToken)).then(({result}) =>
				cy.ssoAdminApi('put','/allowlist',adminToken,{revision:result.revision,emails:['allowed@example.com']}))
			.then(() => {
				deniedProfile(first); deniedProfile(second); deniedProfile(child);
				cy.task('backendApiGet',{baseUrl:remote,token:adminToken,path:'/api/users/me'}).its('result.email').should('equal','cypress@example.com');
				return cy.task('backendApiPut',{token:adminToken,path:`/api/users/${accountID}`,data:{capabilities:[]}});
			});
	});

	it('logout replay is rejected on the second instance while an unrelated local session survives', () => {
		loginThroughOIDC().then((token) => cy.task('backendApiPost',{token,path:'/api/auth/logout',data:{}}).then(() => {
			cy.task('backendApiPost',{baseUrl:'http://127.0.0.1:3082',token,path:'/api/auth/refresh',data:{},returnOnError:true}).its('error.code').should('equal',401);
			cy.task('backendApiPost',{baseUrl:'http://127.0.0.1:3082',token,path:'/api/auth/logout',data:{},returnOnError:true}).its('error.code').should('equal',401);
			cy.task('backendApiGet',{baseUrl:'http://127.0.0.1:3082',token:adminToken,path:'/api/users/me'}).its('result.email').should('equal','cypress@example.com');
		}));
	});
});
