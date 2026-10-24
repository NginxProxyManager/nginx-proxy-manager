import type { TokenResponse } from "src/api/backend";

export const TOKEN_KEY = "authentications";

export interface AuthSnapshot {
	generation: number;
	stored: string | null;
}

export class AuthStore {
	private generation = 0;

	// The generation distinguishes leaving and returning to the same credential.
	// The stored value also detects cross-tab changes before their storage event.
	snapshot(): AuthSnapshot {
		return { generation: this.generation, stored: localStorage.getItem(TOKEN_KEY) };
	}

	isCurrent(snapshot: AuthSnapshot) {
		return snapshot.generation === this.generation && snapshot.stored === localStorage.getItem(TOKEN_KEY);
	}

	invalidatePending() {
		this.generation++;
	}
	// Get all tokens from stack
	get tokens() {
		const t = localStorage.getItem(TOKEN_KEY);
		let tokens = [];
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

	// Get expires from last token
	get expires() {
		const t = this.token;
		if (t && typeof t.expires !== "undefined") {
			const expires = Number(t.expires);
			if (expires && !Number.isNaN(expires)) {
				return expires;
			}
		}
		return null;
	}

	// Filter out invalid tokens and return true if we find one that is valid
	// Start from the END of the stack and work backwards
	hasActiveToken() {
		const t = this.tokens;
		if (!t.length) {
			return false;
		}

		const now = Math.round(Date.now() / 1000);
		const oneMinuteBuffer = 60;
		for (let i = t.length - 1; i >= 0; i--) {
			const valid = Number(t[i].expires) - oneMinuteBuffer > now;
			if (valid) {
				return true;
			}
			this.drop();
		}
		return false;
	}

	// Set a single token on the stack
	set({ token, expires }: TokenResponse) {
		this.invalidatePending();
		localStorage.setItem(TOKEN_KEY, JSON.stringify([{ token, expires }]));
	}

	// Add a token to the END of the stack
	add({ token, expires }: TokenResponse) {
		this.invalidatePending();
		const t = this.tokens;
		t.push({ token, expires });
		localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
	}

	// Refresh only the active session. This preserves the parent token while
	// an administrator is impersonating another user.
	replaceTop({ token, expires }: TokenResponse) {
		this.invalidatePending();
		const t = this.tokens;
		if (!t.length) {
			this.set({ token, expires });
			return;
		}
		t[t.length - 1] = { token, expires };
		localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
	}

	// Drop a token from the END of the stack
	drop() {
		this.invalidatePending();
		const t = this.tokens;
		t.splice(-1, 1);
		localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
	}

	clear() {
		this.invalidatePending();
		localStorage.removeItem(TOKEN_KEY);
	}

	count() {
		return this.tokens.length;
	}
}

export default new AuthStore();
