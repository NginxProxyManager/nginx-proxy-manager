import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useState } from "react";
import { useIntervalWhen } from "rooks";
import {
	getToken,
	isTwoFactorChallenge,
	loginAsUser,
	refreshToken,
	verify2FA,
	type TokenResponse,
} from "src/api/backend";
import AuthStore from "src/modules/AuthStore";

// 2FA challenge state
export interface TwoFactorChallenge {
	challengeToken: string;
}

// Context
export interface AuthContextType {
	authenticated: boolean;
	twoFactorChallenge: TwoFactorChallenge | null;
	login: (username: string, password: string) => Promise<void>;
	verifyTwoFactor: (code: string) => Promise<void>;
	cancelTwoFactor: () => void;
	loginAs: (id: number) => Promise<void>;
	logout: () => void;
	setOidcTwoFactorChallenge: (challengeToken: string) => void;
	token?: string;
}

const initalValue = null;
const AuthContext = createContext<AuthContextType | null>(initalValue);

// Provider
interface Props {
	children?: ReactNode;
	tokenRefreshInterval?: number;
}
function AuthProvider({ children, tokenRefreshInterval = 5 * 60 * 1000 }: Props) {
	const queryClient = useQueryClient();
	const [authenticated, setAuthenticated] = useState(AuthStore.hasActiveToken());
	const [twoFactorChallenge, setTwoFactorChallenge] = useState<TwoFactorChallenge | null>(null);

	const handleTokenUpdate = (response: TokenResponse) => {
		AuthStore.set(response);
		setAuthenticated(true);
		setTwoFactorChallenge(null);
	};

	const login = async (identity: string, secret: string) => {
		const response = await getToken(identity, secret);
		if (isTwoFactorChallenge(response)) {
			setTwoFactorChallenge({ challengeToken: response.challengeToken });
			return;
		}
		handleTokenUpdate(response);
	};

	const verifyTwoFactor = async (code: string) => {
		if (!twoFactorChallenge) {
			throw new Error("No 2FA challenge pending");
		}
		const response = await verify2FA(twoFactorChallenge.challengeToken, code);
		handleTokenUpdate(response);
	};

	const cancelTwoFactor = () => {
		setTwoFactorChallenge(null);
	};

	const setOidcTwoFactorChallenge = (challengeToken: string) => {
		setTwoFactorChallenge({ challengeToken });
	};

	const loginAs = async (id: number) => {
		const response = await loginAsUser(id);
		AuthStore.add(response);
		queryClient.clear();
		window.location.reload();
	};

	const logout = () => {
		if (AuthStore.count() >= 2) {
			AuthStore.drop();
			queryClient.clear();
			window.location.reload();
			return;
		}

		// RP-initiated logout: if the session was OIDC-initiated, redirect to provider logout
		const oidcProvider = localStorage.getItem("oidc_session_provider");
		if (oidcProvider) {
			localStorage.removeItem("oidc_session_provider");
			const currentToken = AuthStore.token?.token ?? "";
			AuthStore.clear();
			setAuthenticated(false);
			queryClient.clear();
			// Fire-and-forget: try to get logout URL and redirect; fall back silently
			fetch(`/api/oidc/${encodeURIComponent(oidcProvider)}/logout`, {
				headers: { Authorization: `Bearer ${currentToken}` },
			})
				.then((r) => r.json())
				.then((data) => {
					if (data?.logout_url) {
						window.location.href = data.logout_url;
					}
				})
				.catch(() => {
					// Ignore — user is already locally logged out
				});
			return;
		}

		AuthStore.clear();
		setAuthenticated(false);
		queryClient.clear();
	};

	const refresh = async () => {
		const response = await refreshToken();
		handleTokenUpdate(response);
	};

	useIntervalWhen(
		() => {
			if (authenticated) {
				refresh();
			}
		},
		tokenRefreshInterval,
		true,
	);

	const value = {
		authenticated,
		twoFactorChallenge,
		login,
		verifyTwoFactor,
		cancelTwoFactor,
		loginAs,
		logout,
		setOidcTwoFactorChallenge,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthState() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuthState must be used within a AuthProvider");
	}
	return context;
}

export { AuthProvider, useAuthState };
export default AuthContext;
