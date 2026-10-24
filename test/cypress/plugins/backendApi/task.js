const logger = require('./logger');
const Client = require('./client');
const {execFileSync} = require('node:child_process');
const https = require('node:https');
const http = require('node:http');

module.exports = function (config) {
	const backendConfig = Object.assign({}, config, {
		baseUrl: config.env.backendApiUrl || config.baseUrl,
	});

	logger('Client Ready using', backendConfig.baseUrl);
	const clientFor = (options) => new Client(Object.assign({}, backendConfig, {
		baseUrl: options.baseUrl || backendConfig.baseUrl,
	}));
	const streams = new Map();

	return {
		ssoSSEOpen: ({id, token}) => new Promise((resolve, reject) => {
			if (streams.has(id)) throw new Error('duplicate stream handle');
			const state = {text:'', closed:false};
			const request = http.get(`http://127.0.0.1:3082/api/sse?jwt=${encodeURIComponent(token)}`, (response) => {
				state.response = response;
				if (response.statusCode !== 200) { response.resume(); reject(new Error(`stream status ${response.statusCode}`)); return; }
				response.on('data', (chunk) => {
					state.text += chunk.toString();
					if (state.text.includes(': connected')) resolve(true);
				});
				response.on('close', () => { state.closed = true; });
			});
			state.request = request; streams.set(id,state);
			request.setTimeout(10000, () => request.destroy(new Error('stream startup timeout')));
			request.on('error', reject);
		}),
		ssoWaitForDeliveryGate: async ({token,sessionID}) => {
			const api=clientFor({baseUrl:'http://127.0.0.1:3082'}); api.setToken(token);
			const deadline=Date.now()+3000;
			while(Date.now()<deadline) {
				const value=await api.postJson('/api/sse-notification',{test_delivery_gate:{session_id:sessionID,action:'status'}});
				if(value.result.reached) return true;
				await new Promise((resolve)=>setTimeout(resolve,25));
			}
			throw new Error('protected event never reached pre-authorization gate');
		},
		ssoSSEEvidence: async ({id, waitForClose=false, waitForText=''}) => {
			const state = streams.get(id); if (!state) throw new Error('unknown stream handle');
			if (waitForClose || waitForText) {
				const deadline = Date.now()+5000;
				while (!(waitForClose ? state.closed : state.text.includes(waitForText)) && Date.now()<deadline) await new Promise((resolve) => setTimeout(resolve,25));
			}
			return {text:state.text, closed:state.closed};
		},
		ssoSSEClose: ({id}) => { const state=streams.get(id); if(state) state.request.destroy(); streams.delete(id); return null; },
		ssoSAMLRejectsUnsigned: async ({signedURL}) => {
			const issuer = new URL(config.env.samlMetadataUrl).origin;
			const original = new URL(signedURL);
			if (original.origin !== issuer || original.pathname !== '/sso') throw new Error('unexpected fixture endpoint');
			const ca = execFileSync('docker', ['exec', `npm-sso-${config.env.stack}-saml-1`, 'cat', '/certs/saml.crt'], {encoding:'utf8'});
			const request = (url) => new Promise((resolve, reject) => {
				https.get(url, {ca, rejectUnauthorized:true}, (response) => { response.resume(); response.on('end', () => resolve(response.statusCode)); }).on('error', reject);
			});
			const unsigned = new URL(original); unsigned.searchParams.delete('Signature'); unsigned.searchParams.delete('SigAlg');
			const invalid = new URL(original); invalid.searchParams.set('RelayState', 'tampered');
			return {unsigned: await request(unsigned), invalid: await request(invalid)};
		},
		ssoAttemptEvidence: () => {
			const stack = config.env.stack;
			if (!['postgres', 'mysql', 'sqlite'].includes(stack)) throw new Error('explicit SSO DB matrix required');
			const rows = `SELECT 'handoff' AS kind,code_hash AS id,connection_id,user_id,CASE WHEN consumed_at IS NULL THEN 'open' ELSE 'consumed' END AS status,expires_at AS observed_at FROM sso_handoff UNION ALL SELECT 'session',id,connection_id,user_id,CASE WHEN revoked_at IS NULL THEN 'open' ELSE 'revoked' END,created_at FROM session WHERE source='sso'`;
			let args;
			if (stack === 'postgres') args = ['exec', `npm-sso-${stack}-postgres-1`, 'psql', '-U', 'npm', '-d', 'npm', '-At', '-c', `SELECT row_to_json(e) FROM (${rows}) e`];
			if (stack === 'mysql') args = ['exec', `npm-sso-${stack}-mysql-1`, 'mysql', '-unpm', '-psso-test-only', '-D', 'npm', '-N', '-B', '-e', `SELECT JSON_OBJECT('kind',kind,'id',id,'connection_id',connection_id,'user_id',user_id,'status',status,'observed_at',observed_at) FROM (${rows}) e`];
			if (stack === 'sqlite') args = ['exec', `npm-sso-${stack}-evidence-1`, 'sqlite3', '-json', '/data/nginxproxymanager.db', rows];
			const raw = execFileSync('docker', args, {encoding:'utf8'}).trim();
			return stack === 'sqlite' ? JSON.parse(raw || '[]') : raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
		},

		/**
		 * @param   {object}    options
		 * @param   {string}    options.token        JWT
		 * @param   {string}    options.path         API path
		 * @param   {bool}      [options.returnOnError] If true, will return instead of throwing errors
		 * @returns {string}
		 */
		backendApiGet: (options) => {
			const api = clientFor(options);
			api.setToken(options.token);
			return api.get(options.path, options.returnOnError || false);
		},

		/**
		 * @param   {object}    options
		 * @param   {string}    options.token        JWT
		 * @param   {string}    options.path         API path
		 * @param   {object}    options.data
		 * @param   {bool}      [options.returnOnError] If true, will return instead of throwing errors
		 * @returns {string}
		 */
		backendApiPost: (options) => {
			const api = clientFor(options);
			api.setToken(options.token);
			return api.postJson(options.path, options.data, options.returnOnError || false);
		},

		/**
		 * @param   {object}    options
		 * @param   {string}    options.token        JWT
		 * @param   {string}    options.path         API path
		 * @param   {object}    options.data
		 * @param   {bool}      [options.returnOnError] If true, will return instead of throwing errors
		 * @returns {string}
		 */
		backendApiPut: (options) => {
			const api = clientFor(options);
			api.setToken(options.token);
			return api.putJson(options.path, options.data, options.returnOnError || false);
		},

		/**
		 * @param   {object}    options
		 * @param   {string}    options.token        JWT
		 * @param   {string}    options.path         API path
		 * @param   {bool}      [options.returnOnError] If true, will return instead of throwing errors
		 * @returns {string}
		 */
		backendApiDelete: (options) => {
			const api = clientFor(options);
			api.setToken(options.token);
			return api.delete(options.path, options.returnOnError || false);
		}
	};
};
