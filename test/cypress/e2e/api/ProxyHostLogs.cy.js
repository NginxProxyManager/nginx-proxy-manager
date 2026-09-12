/// <reference types="cypress" />

describe('Proxy Host Logs endpoints', () => {
	let token;
	let hostId;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;

			// Create a proxy host for testing logs
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/proxy-hosts',
				data:  {
					domain_names:   ['logs-test.example.com'],
					forward_scheme: 'http',
					forward_host:   '127.0.0.1',
					forward_port:   80,
					access_list_id: '0',
					certificate_id: 0,
					meta:           {
						dns_challenge: false
					},
					advanced_config:         '',
					locations:               [],
					block_exploits:          false,
					caching_enabled:         false,
					allow_websocket_upgrade: false,
					http2_support:           false,
					hsts_enabled:            false,
					hsts_subdomains:         false,
					ssl_forced:              false
				}
			}).then((data) => {
				hostId = data.id;
			});
		});
	});

	it('Should return 404 for nonexistent host', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/nginx/proxy-hosts/999999/logs',
			returnOnError: true
		}).then((data) => {
			expect(data).to.have.property('error');
			expect(data.error.code).to.be.equal(404);
		});
	});

	it('Should return 404 for unauthorized user', () => {
		cy.task('backendApiGet', {
			path:  `/api/nginx/proxy-hosts/${hostId}/logs`,
			returnOnError: true
		}).then((data) => {
			expect(data).to.have.property('error');
			// jwtdecode middleware returns 404 when no token is provided
			expect(data.error.code).to.be.equal(404);
		});
	});

	it('Should handle empty or missing access log', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}/logs?type=access`,
			returnOnError: true
		}).then((data) => {
			// nginx may or may not have created the log file yet.
			// Accept both states: 404 if file doesn't exist, or 200 with 0 lines if file is empty.
			if (data.error) {
				expect(data.error.code).to.be.equal(404);
			} else {
				expect(data).to.have.property('host_id', hostId);
				expect(data).to.have.property('returned_lines', 0);
				expect(data.lines).to.be.an('array').that.is.empty;
			}
		});
	});

	describe('With populated log files', () => {
		const accessLogContent = [
			'[05/Jun/2026:15:00:00 +0000] HIT 200 200 - GET http logs-test.example.com "/api/v1/users" [Client 192.168.1.10] [Length 500] [Gzip 1.2] [Sent-to 127.0.0.1] "Mozilla" "referer"',
			'[05/Jun/2026:15:01:00 +0000] MISS 200 200 - GET http logs-test.example.com "/api/v1/users" [Client 192.168.1.10] [Length 500] [Gzip 1.2] [Sent-to 127.0.0.1] "Mozilla" "referer"',
			'[05/Jun/2026:15:02:00 +0000] HIT 304 304 - GET http logs-test.example.com "/assets/logo.png" [Client 192.168.1.11] [Length 120] [Gzip -] [Sent-to 127.0.0.1] "Mozilla" "referer"',
			'[05/Jun/2026:15:03:00 +0000] - - 404 - GET http logs-test.example.com "/notfound" [Client 192.168.1.12] [Length 230] [Gzip -] [Sent-to 127.0.0.1] "Mozilla" "referer"'
		].join('\n');

		const errorLogContent = [
			'2026/06/05 15:02:00 [warn] 123#123: *456 using cache key, client: 192.168.1.11',
			'2026/06/05 15:03:00 [error] 123#123: *457 open() "/notfound" failed, client: 192.168.1.12'
		].join('\n');

		before(() => {
			// Populate the access logs
			cy.task('writeMockLog', {
				hostId:  hostId,
				type:    'access',
				content: accessLogContent
			});

			// Populate the error logs
			cy.task('writeMockLog', {
				hostId:  hostId,
				type:    'error',
				content: errorLogContent
			});
		});

		it('Should retrieve access logs with 200', () => {
			cy.task('backendApiGet', {
				token: token,
				path:  `/api/nginx/proxy-hosts/${hostId}/logs?type=access`
			}).then((data) => {
				expect(data).to.have.property('host_id', hostId);
				expect(data).to.have.property('log_type', 'access');
				expect(data).to.not.have.property('file');
				expect(data).to.not.have.property('total_lines');
				expect(data.lines).to.be.an('array');
				expect(data.lines.length).to.be.equal(4);
				expect(data.lines[0]).to.contain('15:00:00');
				expect(data.lines[3]).to.contain('15:03:00');
			});
		});

		it('Should retrieve error logs with 200', () => {
			cy.task('backendApiGet', {
				token: token,
				path:  `/api/nginx/proxy-hosts/${hostId}/logs?type=error`
			}).then((data) => {
				expect(data).to.have.property('host_id', hostId);
				expect(data).to.have.property('log_type', 'error');
				expect(data).to.not.have.property('file');
				expect(data).to.not.have.property('total_lines');
				expect(data.lines).to.be.an('array');
				expect(data.lines.length).to.be.equal(2);
				expect(data.lines[0]).to.contain('[warn]');
				expect(data.lines[1]).to.contain('[error]');
			});
		});

		it('Should filter logs with search parameter', () => {
			cy.task('backendApiGet', {
				token: token,
				path:  `/api/nginx/proxy-hosts/${hostId}/logs?type=access&search=logo.png`
			}).then((data) => {
				expect(data.lines.length).to.be.equal(1);
				expect(data.lines[0]).to.contain('/assets/logo.png');
			});
		});

		it('Should filter logs with since parameter', () => {
			// ISO 8601 for 15:01:30 UTC on 2026-06-05
			const sinceTime = '2026-06-05T15:01:30Z';
			cy.task('backendApiGet', {
				token: token,
				path:  `/api/nginx/proxy-hosts/${hostId}/logs?type=access&since=${sinceTime}`
			}).then((data) => {
				// Should return 15:02:00 and 15:03:00 lines (2 lines)
				expect(data.lines.length).to.be.equal(2);
				expect(data.lines[0]).to.contain('15:02:00');
				expect(data.lines[1]).to.contain('15:03:00');
			});
		});

		it('Should limit lines with lines parameter', () => {
			cy.task('backendApiGet', {
				token: token,
				path:  `/api/nginx/proxy-hosts/${hostId}/logs?type=access&lines=2`
			}).then((data) => {
				expect(data.lines.length).to.be.equal(2);
				// Since we read last 2 lines, it should be the ones from 15:02:00 and 15:03:00
				expect(data.lines[0]).to.contain('15:02:00');
				expect(data.lines[1]).to.contain('15:03:00');
			});
		});

		it('Should return summary statistics for access log', () => {
			cy.task('backendApiGet', {
				token: token,
				path:  `/api/nginx/proxy-hosts/${hostId}/logs/summary`
			}).then((data) => {
				expect(data).to.have.property('host_id', hostId);
				expect(data).to.have.property('period', 'last_1000_lines');
				expect(data.status_codes).to.deep.equal({
					'200': 2,
					'304': 1,
					'404': 1
				});
				expect(data.top_paths).to.deep.equal([
					{ path: '/api/v1/users', count: 2 },
					{ path: '/assets/logo.png', count: 1 },
					{ path: '/notfound', count: 1 }
				]);
				expect(data.top_clients).to.deep.equal([
					{ client: '192.168.1.10', count: 2 },
					{ client: '192.168.1.11', count: 1 },
					{ client: '192.168.1.12', count: 1 }
				]);
				// 3 cacheable requests: 2 HIT, 1 MISS. Hit rate = 2/3 = 0.6667
				expect(data.cache_hit_rate).to.be.equal(0.6667);
				expect(data.access_log_size_bytes).to.be.greaterThan(0);
				expect(data.error_log_size_bytes).to.be.greaterThan(0);
			});
		});
	});
});
