import * as client from "openid-client";
import express from "express";
import { rateLimit } from "express-rate-limit";
import errs from "../lib/error.js";
import internalToken from "../internal/token.js";
import { oidc as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const limiter = rateLimit({
	windowMs: 10 * 60 * 1000,
	limit: 10,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	ipv6Subnet: 48,
	skipSuccessfulRequests: true,
	validate: { trustProxy: false },
});

router.use(limiter);

router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET /api/oidc
	 *
	 * OAuth Authorization Code flow initialisation
	 */
	.get(async (_, res) => {
		try {
			const config = await client.discovery(
				new URL(process.env.OIDC_ISSUER_URL),
				process.env.OIDC_CLIENT_ID,
				process.env.OIDC_CLIENT_SECRET,
			);

			const code_verifier = client.randomPKCECodeVerifier();
			const parameters = {
				redirect_uri: `https://${process.env.OIDC_REDIRECT_DOMAIN}/api/oidc/callback`,
				scope: "openid email",
				state: client.randomState(),
				nonce: client.randomNonce(),
				code_challenge_method: "S256",
				code_challenge: await client.calculatePKCECodeChallenge(code_verifier),
			};

			res.cookie("npmplus_oidc_no_redirect", "true", { secure: true, sameSite: "Strict" });
			res.cookie("npmplus_oidc_code_verifier", code_verifier, {
				signed: true,
				httpOnly: true,
				secure: true,
				sameSite: "Lax",
				path: "/api/oidc",
			});
			res.cookie("npmplus_oidc_state", parameters.state, {
				signed: true,
				httpOnly: true,
				secure: true,
				sameSite: "Lax",
				path: "/api/oidc",
			});
			res.cookie("npmplus_oidc_nonce", parameters.nonce, {
				signed: true,
				httpOnly: true,
				secure: true,
				sameSite: "Lax",
				path: "/api/oidc",
			});

			res.redirect(await client.buildAuthorizationUrl(config, parameters).toString());
		} catch (err) {
			logger.error(`Callback error: ${err.message}`);
			res.cookie("npmplus_oidc_no_redirect", "true", { secure: true, sameSite: "Strict" });
			res.clearCookie("npmplus_oidc_state", { path: "/api/oidc" });
			res.clearCookie("npmplus_oidc_nonce", { path: "/api/oidc" });
			res.clearCookie("npmplus_oidc_code_verifier", { path: "/api/oidc" });
			res.redirect("/");
		}
	});

router
	.route("/callback")
	.options((_, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET /api/oidc/callback
	 *
	 * Oauth Authorization Code flow callback
	 */
	.get(async (req, res) => {
		try {
			const config = await client.discovery(
				new URL(process.env.OIDC_ISSUER_URL),
				process.env.OIDC_CLIENT_ID,
				process.env.OIDC_CLIENT_SECRET,
			);

			const tokens = await client.authorizationCodeGrant(
				config,
				new URL(`${req.protocol}://${req.host}${req.originalUrl}`),
				{
					pkceCodeVerifier: req.signedCookies?.npmplus_oidc_code_verifier,
					expectedState: req.signedCookies?.npmplus_oidc_state,
					expectedNonce: req.signedCookies?.npmplus_oidc_nonce,
					idTokenExpected: true,
				},
			);

			const claims = tokens.claims();

			if (!claims.email) throw new errs.AuthError("The Identity Provider didn't send the 'email' claim");

			if (claims.email_verified === false && process.env.OIDC_REQUIRE_VERIFIED_EMAIL === "true") {
				throw new errs.AuthError("The email address has not been verified.");
			}

			logger.info(`Successful authentication for email: ${claims.email.toLowerCase().trim()}`);

			const data = await internalToken.getTokenFromOAuthClaim({ identity: claims.email.toLowerCase().trim() });

			res.cookie("token", data.token, {
				signed: true,
				httpOnly: true,
				secure: true,
				sameSite: "Strict",
				path: "/api",
				expires: new Date(data.expires),
			});

			res.clearCookie("npmplus_oidc_no_redirect");
			res.clearCookie("npmplus_oidc_state", { path: "/api/oidc" });
			res.clearCookie("npmplus_oidc_nonce", { path: "/api/oidc" });
			res.clearCookie("npmplus_oidc_code_verifier", { path: "/api/oidc" });
			res.redirect("/");
		} catch (err) {
			logger.error(`Callback error: ${err.message}`);
			res.clearCookie("npmplus_oidc_state", { path: "/api/oidc" });
			res.clearCookie("npmplus_oidc_nonce", { path: "/api/oidc" });
			res.clearCookie("npmplus_oidc_code_verifier", { path: "/api/oidc" });
			res.redirect("/");
		}
	});

export default router;
