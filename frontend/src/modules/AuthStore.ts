import { getUnixTime, parseISO } from "date-fns";
import type { TokenResponse } from "src/api/backend";

export const TOKEN_KEY = "authentications";

type AuthMethod = "local" | "oidc";

interface StoredToken extends Omit<TokenResponse, "expires"> {
	// It may come as ISO string or unix epoch
	expires: number | string;
	authMethod?: AuthMethod;
	idTokenHint?: string;
}

const toUnixTimestamp = (expires: number | string): number => {
	if (typeof expires === "number") {
		return expires;
	}
	return getUnixTime(parseISO(expires));
};

export class AuthStore {
	// Get all tokens from stack
	get tokens() {
		const t = localStorage.getItem(TOKEN_KEY);
		let tokens: StoredToken[] = [];
		if (t !== null) {
			try {
				tokens = JSON.parse(t);
			} catch (e) {
				console.error("Failed to parse tokens from localStorage", e);
			}
		}
		return tokens;
	}

	// Get last token from stack
	get token() {
		const t = this.tokens;
		if (t.length) {
			return t[t.length - 1];
		}
		return null;
	}

	get authMethod() {
		return this.token?.authMethod || "local";
	}

	get idTokenHint() {
		return this.token?.idTokenHint || null;
	}

	// Get expires from last token (as unix timestamp)
	get expires() {
		const t = this.token;
		if (t && typeof t.expires !== "undefined") {
			const expires = toUnixTimestamp(t.expires);
			if (!Number.isNaN(expires)) {
				return expires;
			}
		}
		return null;
	}

	// Filter out invalid tokens and return true if we find one that is valid
	// hasActiveToken() {
	// 	const t = this.tokens;
	// 	return t.length > 0;
	// }
	// Start from the END of the stack and work backwards
	hasActiveToken() {
		const t = this.tokens;
		if (!t.length) {
			return false;
		}

		const now = Math.round(Date.now() / 1000);
		const oneMinuteBuffer = 60;
		for (let i = t.length - 1; i >= 0; i--) {
			const dte = toUnixTimestamp(t[i].expires);
			const valid = dte - oneMinuteBuffer > now;
			if (valid) {
				return true;
			}
			this.drop();
		}
		return false;
	}

	// Set a single token on the stack
	set({ token, expires }: TokenResponse, options: { authMethod?: AuthMethod; idTokenHint?: string } = {}) {
		localStorage.setItem(
			TOKEN_KEY,
			JSON.stringify([
				{
					token,
					expires,
					authMethod: options.authMethod || "local",
					idTokenHint: options.idTokenHint,
				},
			]),
		);
	}

	// Add a token to the END of the stack
	add({ token, expires }: TokenResponse, options: { authMethod?: AuthMethod; idTokenHint?: string } = {}) {
		const t = this.tokens;
		t.push({ token, expires, authMethod: options.authMethod || "local", idTokenHint: options.idTokenHint });
		localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
	}

	// Drop a token from the END of the stack
	drop() {
		const t = this.tokens;
		t.splice(-1, 1);
		localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
	}

	clear() {
		localStorage.removeItem(TOKEN_KEY);
	}

	count() {
		return this.tokens.length;
	}
}

export default new AuthStore();
