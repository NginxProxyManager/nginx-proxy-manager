import * as oidc from "openid-client";
import { sso as logger } from "../../logger.js";
import { decryptRSA } from "../encrypt.js";
import errs from "../error.js";
import { concludeAuthorized, parseStateFromCookie } from "./lib.js";
/**
 *
 *
 * @param {Setting} row
 * */
const getGitHubInitParams = async (_req, row) => {
	const config = row.configuration_github;
	const client_id = config.github_client_id;
	const redirect_uri = config.redirect_url;
	const scope = "user:email+read:org+offline_access";
	const state = oidc.randomState();
	const code_verifier = oidc.randomPKCECodeVerifier();
	const code_challenge = await oidc.calculatePKCECodeChallenge(code_verifier);
	const code_challenge_method = "S256";

	const authParams = {
		client_id,
		scope,
		state,
		code_challenge,
		code_challenge_method,
		redirect_uri,
	};
	const query = Object.entries(authParams).map(([key, value]) => {
		return `${key}=${value}`;
	});
	const url = `https://github.com/login/oauth/authorize?${query.join("&")}`;

	return { state, code_verifier, url };
};

/**
 * Validates callback parameters and requests authorization grant from the IdP.
 *
 * @param {Request} req
 * @param {Setting} config
 * @return {Promise} a promise resolving to a jwt token
 * */
const validateGitHubCallback = async (req, config) => {
	const currentUrl = new URL(`${config.configuration_github.redirect_url}?${req.originalUrl?.split("?")?.[1]}`);

	const conf = config.configuration_github;
	const client_id = conf.github_client_id;
	const client_secret = decryptRSA(Buffer.from(conf.client_secret, "base64"));
	const redirect_uri = conf.redirect_url;
	const code = req.query.code;
	const { state, code_verifier } = parseStateFromCookie(req);

	// verify state from authorization request
	if (state !== currentUrl.searchParams.get("state")) {
		throw new errs.AuthError("sso.error.sso.error.default");
	}

  let token;
	let user;
  let email;
  let groups = [];

	// request authorization grant, and receive the user's access token
	try {
    const url = "https://github.com/login/oauth/access_token";
  	const params = {
  		code,
  		client_id,
  		client_secret,
  		redirect_uri,
  		code_verifier,
  	};
  	const response = await fetch(url, {
  		method: "POST",
  		headers: {
  			"Content-Type": "application/json",
  			Accept: "application/json",
  		},
  		body: JSON.stringify(params),
    });

    const body = await response.json();
    token = body.access_token;
  } catch (_err) { }

  if (!token) {
    throw new errs.AuthError("sso.error.default");
  }

  const headers = { Authorization: `token ${token}` };

	// request user details
	try {
    const userResponse = await fetch("https://api.github.com/user", { headers });
    user = await userResponse.json();
  } catch (_err) {}

	// request user email
	try {
  	const emailResponse = await fetch("https://api.github.com/user/emails", { headers });
  	const emails = await emailResponse.json();
    email = emails?.find?.((email) => email.primary === true)?.email;
	} catch (_err) {}

  // request user organizations
  try {
    const orgsResponse = await fetch("https://api.github.com/user/orgs", { headers });
    const orgs = await orgsResponse.json();
    groups = orgs?.map?.((org) => org.login) || [];
  } catch (_err) {}

	if (!user || !email) {
		logger.error(`[${req.params.client_id}] The Identity Provider didn't send the 'email' claim`);
		throw new errs.AuthError("sso.error.email-claim-required");
	}

	const claims = {
		iss: user.node_id,
		iat: Math.floor(Date.now() / 1000),
		sub: user.url,
		aud: conf.github_client_id,
		email,
		groups,
		avatar: user.avatar_url,
		name: user.name,
		nickname: user.login,
	};

	return concludeAuthorized(config, claims);
};

export { getGitHubInitParams, validateGitHubCallback };
