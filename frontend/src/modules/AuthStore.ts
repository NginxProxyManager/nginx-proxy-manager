import { TokenResponse } from "api/npm";

export const TOKEN_KEY = "authentications";

export class AuthStore {
	// Get all tokens from stack
	get tokens() {
		const t = localStorage.getItem(TOKEN_KEY);
		let tokens = [];
		if (t !== null) {
			try {
				tokens = JSON.parse(t);
			} catch (e) {
				// do nothing
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

	// Get expires from last token
	get expires() {
		const t = this.token;
		if (t && typeof t.expires !== "undefined") {
			const expires = Number(t.expires);
			if (expires && !isNaN(expires)) {
				return expires;
			}
		}
		return null;
	}

	// Filter out invalid tokens and return true if we find one that is valid
	hasActiveToken() {
		const t = this.tokens;
		if (!t.length) {
			return false;
		}

		const now = Math.round(new Date().getTime() / 1000);
		const oneMinuteBuffer = 60;
		for (let i = t.length - 1; i >= 0; i--) {
			const valid = t[i].expires - oneMinuteBuffer > now;
			if (valid) {
				return true;
			} else {
				this.drop();
			}
		}
		return false;
	}

	// Set a single token on the stack
	set({ token, expires }: TokenResponse) {
		localStorage.setItem(TOKEN_KEY, JSON.stringify([{ token, expires }]));
	}

	// Add a token to the stack
	add({ token, expires }: TokenResponse) {
		const t = this.tokens;
		t.push({ token, expires });
		localStorage.setItem(TOKEN_KEY, t);
	}

	// Drop a token from the stack
	drop() {
		const t = this.tokens;
		localStorage.setItem(TOKEN_KEY, t.splice(-1, 1));
	}

	clear() {
		localStorage.removeItem(TOKEN_KEY);
	}
}

export default new AuthStore();
