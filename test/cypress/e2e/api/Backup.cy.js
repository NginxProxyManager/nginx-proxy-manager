/// <reference types="cypress" />

describe('Backup endpoints', () => {
	let token;
	let backupData;

	// Track created resource IDs for verification
	let createdResources = {};

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	after(() => {
		// The import test restores all data from the backup, which affects subsequent test suites.
		// We need to clean up by deleting all restored resources and resetting users.
		// Re-authenticate first since the import replaced all users.
		cy.getToken().then((newToken) => {
			// Delete all streams
			cy.task('backendApiGet', {
				token: newToken,
				path: '/api/nginx/streams'
			}).then((streams) => {
				const deleteStreams = streams.map(s =>
					cy.task('backendApiDelete', {
						token: newToken,
						path: `/api/nginx/streams/${s.id}`
					})
				);
				return Cypress.Promise.all(deleteStreams);
			}).then(() => {
				// Delete all dead hosts
				return cy.task('backendApiGet', {
					token: newToken,
					path: '/api/nginx/dead-hosts'
				});
			}).then((deadHosts) => {
				const deleteDeadHosts = deadHosts.map(h =>
					cy.task('backendApiDelete', {
						token: newToken,
						path: `/api/nginx/dead-hosts/${h.id}`
					})
				);
				return Cypress.Promise.all(deleteDeadHosts);
			}).then(() => {
				// Delete all redirection hosts
				return cy.task('backendApiGet', {
					token: newToken,
					path: '/api/nginx/redirection-hosts'
				});
			}).then((redirectionHosts) => {
				const deleteRedirectionHosts = redirectionHosts.map(h =>
					cy.task('backendApiDelete', {
						token: newToken,
						path: `/api/nginx/redirection-hosts/${h.id}`
					})
				);
				return Cypress.Promise.all(deleteRedirectionHosts);
			}).then(() => {
				// Delete all proxy hosts
				return cy.task('backendApiGet', {
					token: newToken,
					path: '/api/nginx/proxy-hosts'
				});
			}).then((proxyHosts) => {
				const deleteProxyHosts = proxyHosts.map(h =>
					cy.task('backendApiDelete', {
						token: newToken,
						path: `/api/nginx/proxy-hosts/${h.id}`
					})
				);
				return Cypress.Promise.all(deleteProxyHosts);
			}).then(() => {
				// Delete all access lists
				return cy.task('backendApiGet', {
					token: newToken,
					path: '/api/nginx/access-lists'
				});
			}).then((accessLists) => {
				const deleteAccessLists = accessLists.map(a =>
					cy.task('backendApiDelete', {
						token: newToken,
						path: `/api/nginx/access-lists/${a.id}`
					})
				);
				return Cypress.Promise.all(deleteAccessLists);
			}).then(() => {
				// Delete all certificates
				return cy.task('backendApiGet', {
					token: newToken,
					path: '/api/nginx/certificates'
				});
			}).then((certificates) => {
				const deleteCertificates = certificates.map(c =>
					cy.task('backendApiDelete', {
						token: newToken,
						path: `/api/nginx/certificates/${c.id}`
					})
				);
				return Cypress.Promise.all(deleteCertificates);
			}).then(() => {
				// Finally reset users to put system back in setup mode
				cy.resetUsers();
			});
		});
	});

	it('Full backup/restore cycle with all resource types', () => {
		// =====================================================
		// STEP 1: Create one resource of every type
		// =====================================================

		// 1a. Create a non-admin user
		cy.task('backendApiPost', {
			token: token,
			path: '/api/users',
			data: {
				name: 'Backup Test User',
				nickname: 'BackupUser',
				email: 'backupuser@example.com',
				roles: [],
				auth: {
					type: 'password',
					secret: 'testpassword123'
				}
			}
		}).then((user) => {
			expect(user).to.have.property('id');
			createdResources.nonAdminUser = user;

			// 1b. Create a custom certificate
			cy.task('backendApiPost', {
				token: token,
				path: '/api/nginx/certificates',
				data: {
					provider: 'other',
					nice_name: 'Backup Test Certificate'
				}
			}).then((cert) => {
				expect(cert).to.have.property('id');
				createdResources.certificate = cert;

				// Upload certificate files
				cy.task('backendApiPostFiles', {
					token: token,
					path: `/api/nginx/certificates/${cert.id}/upload`,
					files: {
						certificate: 'test.example.com.pem',
						certificate_key: 'test.example.com-key.pem'
					}
				}).then(() => {

					// 1c. Create an access list
					cy.task('backendApiPost', {
						token: token,
						path: '/api/nginx/access-lists',
						data: {
							name: 'Backup Test Access List',
							satisfy_any: true,
							pass_auth: false,
							items: [
								{
									username: 'testuser',
									password: 'testpass'
								}
							],
							clients: [
								{
									directive: 'allow',
									address: '192.168.1.0/24'
								}
							]
						}
					}).then((accessList) => {
						expect(accessList).to.have.property('id');
						createdResources.accessList = accessList;

						// 1d. Create a proxy host (with certificate and access list)
						cy.task('backendApiPost', {
							token: token,
							path: '/api/nginx/proxy-hosts',
							data: {
								domain_names: ['backup-proxy.example.com'],
								forward_scheme: 'http',
								forward_host: '192.168.1.100',
								forward_port: 8080,
								access_list_id: accessList.id,
								certificate_id: cert.id,
								meta: {},
								advanced_config: '',
								locations: [],
								block_exploits: false,
								caching_enabled: false,
								allow_websocket_upgrade: true,
								http2_support: false,
								hsts_enabled: false,
								hsts_subdomains: false,
								ssl_forced: false
							}
						}).then((proxyHost) => {
							expect(proxyHost).to.have.property('id');
							createdResources.proxyHost = proxyHost;

							// 1e. Create a redirection host
							cy.task('backendApiPost', {
								token: token,
								path: '/api/nginx/redirection-hosts',
								data: {
									domain_names: ['backup-redirect.example.com'],
									forward_scheme: 'https',
									forward_http_code: 301,
									forward_domain_name: 'target.example.com',
									preserve_path: true,
									certificate_id: 0,
									ssl_forced: false,
									http2_support: false,
									hsts_enabled: false,
									hsts_subdomains: false,
									block_exploits: false,
									advanced_config: '',
									meta: {}
								}
							}).then((redirectionHost) => {
								expect(redirectionHost).to.have.property('id');
								createdResources.redirectionHost = redirectionHost;

								// 1f. Create a 404 host (dead host)
								cy.task('backendApiPost', {
									token: token,
									path: '/api/nginx/dead-hosts',
									data: {
										domain_names: ['backup-404.example.com'],
										certificate_id: 0,
										ssl_forced: false,
										http2_support: false,
										hsts_enabled: false,
										hsts_subdomains: false,
										advanced_config: '',
										meta: {}
									}
								}).then((deadHost) => {
									expect(deadHost).to.have.property('id');
									createdResources.deadHost = deadHost;

									// 1g. Create a stream
									cy.task('backendApiPost', {
										token: token,
										path: '/api/nginx/streams',
										data: {
											incoming_port: 19999,
											forwarding_host: '192.168.1.200',
											forwarding_port: 3306,
											certificate_id: 0,
											meta: {},
											tcp_forwarding: true,
											udp_forwarding: false
										}
									}).then((stream) => {
										expect(stream).to.have.property('id');
										createdResources.stream = stream;

										// =====================================================
										// STEP 2: Export backup
										// =====================================================
										cy.task('backendApiGetBuffer', {
											token: token,
											path: '/api/backup/export'
										}).then((result) => {
											expect(result).to.have.property('length');
											expect(result.length).to.be.greaterThan(0);
											backupData = result.data;

											// =====================================================
											// STEP 3: Delete all created resources
											// =====================================================
											cy.task('backendApiDelete', {
												token: token,
												path: `/api/nginx/streams/${createdResources.stream.id}`
											}).then(() => {
												cy.task('backendApiDelete', {
													token: token,
													path: `/api/nginx/dead-hosts/${createdResources.deadHost.id}`
												}).then(() => {
													cy.task('backendApiDelete', {
														token: token,
														path: `/api/nginx/redirection-hosts/${createdResources.redirectionHost.id}`
													}).then(() => {
														cy.task('backendApiDelete', {
															token: token,
															path: `/api/nginx/proxy-hosts/${createdResources.proxyHost.id}`
														}).then(() => {
															cy.task('backendApiDelete', {
																token: token,
																path: `/api/nginx/access-lists/${createdResources.accessList.id}`
															}).then(() => {
																cy.task('backendApiDelete', {
																	token: token,
																	path: `/api/nginx/certificates/${createdResources.certificate.id}`
																}).then(() => {
																	cy.task('backendApiDelete', {
																		token: token,
																		path: `/api/users/${createdResources.nonAdminUser.id}`
																	}).then(() => {

																		// Verify resources are deleted
																		cy.task('backendApiGet', {
																			token: token,
																			path: '/api/nginx/proxy-hosts'
																		}).then((hosts) => {
																			const found = hosts.find(h => h.domain_names && h.domain_names.includes('backup-proxy.example.com'));
																			expect(found).to.be.undefined;

																			// =====================================================
																			// STEP 4: Import the backup
																			// =====================================================
																			cy.task('backendApiPostBuffer', {
																				token: token,
																				path: '/api/backup/import',
																				buffer: backupData,
																				fieldName: 'backup',
																				fileName: 'backup.zip'
																			}).then((importResult) => {
																				expect(importResult).to.have.property('success', true);

																				// =====================================================
																				// STEP 5: Re-authenticate (import replaces all users)
																				// =====================================================
																				cy.getToken().then((newToken) => {
																					token = newToken;

																					// =====================================================
																					// STEP 6: Verify all resources were restored
																					// =====================================================

																					// Verify non-admin user
																					cy.task('backendApiGet', {
																						token: token,
																						path: '/api/users'
																					}).then((users) => {
																						const restoredUser = users.find(u => u.email === 'backupuser@example.com');
																						expect(restoredUser).to.not.be.undefined;
																						expect(restoredUser.name).to.equal('Backup Test User');
																						expect(restoredUser.roles).to.deep.equal([]);

																						// Verify certificate
																						cy.task('backendApiGet', {
																							token: token,
																							path: '/api/nginx/certificates'
																						}).then((certs) => {
																							const restoredCert = certs.find(c => c.nice_name === 'Backup Test Certificate');
																							expect(restoredCert).to.not.be.undefined;

																							// Verify access list
																							cy.task('backendApiGet', {
																								token: token,
																								path: '/api/nginx/access-lists'
																							}).then((accessLists) => {
																								const restoredAccessList = accessLists.find(a => a.name === 'Backup Test Access List');
																								expect(restoredAccessList).to.not.be.undefined;
																								expect(restoredAccessList.satisfy_any).to.equal(true);

																								// Verify proxy host
																								cy.task('backendApiGet', {
																									token: token,
																									path: '/api/nginx/proxy-hosts'
																								}).then((proxyHosts) => {
																									const restoredProxy = proxyHosts.find(h => h.domain_names && h.domain_names.includes('backup-proxy.example.com'));
																									expect(restoredProxy).to.not.be.undefined;
																									expect(restoredProxy.forward_host).to.equal('192.168.1.100');
																									expect(restoredProxy.forward_port).to.equal(8080);
																									expect(restoredProxy.allow_websocket_upgrade).to.equal(true);

																									// Verify redirection host
																									cy.task('backendApiGet', {
																										token: token,
																										path: '/api/nginx/redirection-hosts'
																									}).then((redirectionHosts) => {
																										const restoredRedirect = redirectionHosts.find(h => h.domain_names && h.domain_names.includes('backup-redirect.example.com'));
																										expect(restoredRedirect).to.not.be.undefined;
																										expect(restoredRedirect.forward_domain_name).to.equal('target.example.com');
																										expect(restoredRedirect.forward_http_code).to.equal(301);
																										expect(restoredRedirect.preserve_path).to.equal(true);

																										// Verify 404 host
																										cy.task('backendApiGet', {
																											token: token,
																											path: '/api/nginx/dead-hosts'
																										}).then((deadHosts) => {
																											const restoredDead = deadHosts.find(h => h.domain_names && h.domain_names.includes('backup-404.example.com'));
																											expect(restoredDead).to.not.be.undefined;

																											// Verify stream
																											cy.task('backendApiGet', {
																												token: token,
																												path: '/api/nginx/streams'
																											}).then((streams) => {
																												const restoredStream = streams.find(s => s.incoming_port === 19999);
																												expect(restoredStream).to.not.be.undefined;
																												expect(restoredStream.forwarding_host).to.equal('192.168.1.200');
																												expect(restoredStream.forwarding_port).to.equal(3306);
																												expect(restoredStream.tcp_forwarding).to.equal(true);
																											});
																										});
																									});
																								});
																							});
																						});
																					});
																				});
																			});
																		});
																	});
																});
															});
														});
													});
												});
											});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});
});
