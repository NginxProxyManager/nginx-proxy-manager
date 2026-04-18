import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import internalOidc from "../internal/oidc.js";
import { getPrivateKey, getPublicKey } from "../lib/config.js";
import errs from "../lib/error.js";
import {
	buildAuthorizationUrl,
	buildIdpLogoutUrl,
	exchangeAuthorizationCode,
	getOIDCConfig,
	getUserInfo,
	isOIDCEnabled,
} from "../lib/oidc.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const STATE_COOKIE_NAME = "npm_oidc_state";
const STATE_TOKEN_EXPIRY_SECONDS = 10 * 60;

const getFirstString = (value) => {
	if (Array.isArray(value)) {
		return typeof value[0] === "string" ? value[0] : "";
	}
	return typeof value === "string" ? value : "";
};

const parseCookies = (cookieHeader = "") => {
	return cookieHeader.split(";").reduce((acc, pair) => {
		const [rawName, ...rest] = pair.trim().split("=");
		if (!rawName || rest.length === 0) {
			return acc;
		}
		acc[rawName] = decodeURIComponent(rest.join("="));
		return acc;
	}, {});
};

const setStateCookie = (res, value, secure) => {
	const securePart = secure ? "; Secure" : "";
	res.setHeader(
		"Set-Cookie",
		`${STATE_COOKIE_NAME}=${encodeURIComponent(value)}; Max-Age=${STATE_TOKEN_EXPIRY_SECONDS}; Path=/api/oidc; HttpOnly; SameSite=Lax${securePart}`,
	);
};

const clearStateCookie = (res) => {
	res.setHeader(
		"Set-Cookie",
		`${STATE_COOKIE_NAME}=; Max-Age=0; Path=/api/oidc; HttpOnly; SameSite=Lax`,
	);
};

const getRequestOrigin = (req) => {
	const forwardedProto = getFirstString(req.headers["x-forwarded-proto"]);
	const proto = (forwardedProto || req.protocol || "http").split(",")[0].trim();
	const forwardedHost = getFirstString(req.headers["x-forwarded-host"]);
	const host = (forwardedHost || req.get("host") || "localhost").split(",")[0].trim();


	return `${proto}://${host}`;
};

const getSafeRedirectPath = (value) => {
	const redirectPath = getFirstString(value) || "/";
	if (!redirectPath.startsWith("/") || redirectPath.startsWith("//")) {
		return "/";
	}
	return redirectPath;
};

const buildStateToken = ({ state, nonce, redirectPath }) => {
	return jwt.sign(
		{
			state,
			nonce,
			redirectPath,
		},
		getPrivateKey(),
		{
			algorithm: "RS256",
			expiresIn: STATE_TOKEN_EXPIRY_SECONDS,
			issuer: "oidc",
		},
	);
};

const parseStateToken = (token) => {
	return jwt.verify(token, getPublicKey(), {
		algorithms: ["RS256"],
		issuer: "oidc",
	});
};

const assertOIDCEnabled = () => {
	if (!isOIDCEnabled()) {
		throw new errs.ItemNotFoundError();
	}
};

router
	.route("/login")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(async (req, res, next) => {
		try {
			assertOIDCEnabled();
			const state = randomUUID();
			const nonce = randomUUID();
			const redirectPath = getSafeRedirectPath(req.query.redirect_path);
			const stateToken = buildStateToken({ state, nonce, redirectPath });
			const authorizationUrl = await buildAuthorizationUrl({ state, nonce });
			setStateCookie(res, stateToken, req.secure);
			res.redirect(302, authorizationUrl);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/callback")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(async (req, res, next) => {
		try {
			assertOIDCEnabled();
			const cookies = parseCookies(req.headers.cookie || "");
			const stateToken = cookies[STATE_COOKIE_NAME];
			if (!stateToken) {
				throw new errs.AuthError("Invalid OIDC state");
			}

			const stateData = parseStateToken(stateToken);
			const incomingState = getFirstString(req.query.state);
			if (!incomingState || incomingState !== stateData.state) {
				throw new errs.AuthError("Invalid OIDC state");
			}

			const config = getOIDCConfig();
			const callbackUrl = new URL(config.redirectUri);
			Object.entries(req.query)
				.filter(([_, value]) => typeof value === "string")
				.forEach(([key, value]) => {
				callbackUrl.searchParams.set(key, value);
			});

			const tokenSet = await exchangeAuthorizationCode({
				callbackUrl: callbackUrl.toString(),
				expectedState: stateData.state,
				expectedNonce: stateData.nonce,
			});
			const userinfo = await getUserInfo(tokenSet);
			const auth = await internalOidc.authenticateFromUserInfo(userinfo);

			clearStateCookie(res);

			const origin = getRequestOrigin(req);
			const redirectUrl = new URL(stateData.redirectPath || "/", origin);
			redirectUrl.searchParams.set("oidc_token", auth.token);
			redirectUrl.searchParams.set("oidc_expires", auth.expires);
			redirectUrl.searchParams.set("oidc_auth_method", "oidc");
			if (tokenSet.id_token) {
				redirectUrl.searchParams.set("oidc_id_token", tokenSet.id_token);
			}

			res.redirect(302, redirectUrl.toString());
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/logout")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(async (req, res, next) => {
		try {
			assertOIDCEnabled();
			clearStateCookie(res);

			const config = getOIDCConfig();
			const origin = getRequestOrigin(req);
			const postLogoutRedirectUri = config.logoutRedirectUri || `${origin}/`;
			const idTokenHint = getFirstString(req.query.id_token_hint);

			const logoutUrl = await buildIdpLogoutUrl({ postLogoutRedirectUri, idTokenHint });
			if (!logoutUrl) {
				res.redirect(302, postLogoutRedirectUri);
				return;
			}

			res.redirect(302, logoutUrl);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;

