import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { useIntervalWhen } from "rooks";
import {
	getToken,
	exchangeSSOHandoff,
	isTwoFactorChallenge,
	loginAsUser,
	logoutSession,
	refreshToken,
	type TokenResponse,
	verify2FA,
} from "src/api/backend";
import { AUTH_INVALIDATED_EVENT } from "src/api/backend/base";
import AuthStore, { TOKEN_KEY } from "src/modules/AuthStore";

// 2FA challenge state
export interface TwoFactorChallenge {
	challengeToken: string;
}

// Context
export interface AuthContextType {
	authenticated: boolean;
	twoFactorChallenge: TwoFactorChallenge | null;
	login: (type: string, username: string, password: string) => Promise<void>;
	verifyTwoFactor: (code: string) => Promise<void>;
	cancelTwoFactor: () => void;
	loginAs: (id: number) => Promise<void>;
	completeSSO: (code: string) => Promise<void>;
	logout: () => Promise<void>;
	logoutUnconfirmed: boolean;
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
	const [logoutUnconfirmed, setLogoutUnconfirmed] = useState(false);
	const beginAuthenticationChange = () => {
		AuthStore.invalidatePending();
		return AuthStore.snapshot();
	};

	const handleTokenUpdate = (response: TokenResponse) => {
		AuthStore.set(response);
		queryClient.clear();
		setAuthenticated(true);
		setTwoFactorChallenge(null);
		setLogoutUnconfirmed(false);
	};

	const login = async (type: string, identity: string, secret: string) => {
		const authentication = beginAuthenticationChange();
		const response = await getToken({ type, identity, secret });
		if (!AuthStore.isCurrent(authentication)) return;
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
		const authentication = beginAuthenticationChange();
		const response = await verify2FA(twoFactorChallenge.challengeToken, code);
		if (!AuthStore.isCurrent(authentication)) return;
		handleTokenUpdate(response);
	};

	const cancelTwoFactor = () => {
		AuthStore.invalidatePending();
		setTwoFactorChallenge(null);
	};

	const loginAs = async (id: number) => {
		const authentication = beginAuthenticationChange();
		const response = await loginAsUser(id);
		if (!AuthStore.isCurrent(authentication)) return;
		AuthStore.add(response);
		queryClient.clear();
		window.location.reload();
	};

	const completeSSO = async (code: string) => {
		const authentication = beginAuthenticationChange();
		const response = await exchangeSSOHandoff(code);
		if (!AuthStore.isCurrent(authentication)) return;
		// A handoff can arrive while another account is authenticated. Install
		// the new credential, clear every account-scoped query synchronously,
		// and only then expose the authenticated shell to the new account.
		AuthStore.set(response);
		queryClient.clear();
		setAuthenticated(true);
		setTwoFactorChallenge(null);
		setLogoutUnconfirmed(false);
	};

	const clearCurrentSession = () => {
		if (AuthStore.count() >= 2) {
			AuthStore.drop();
			queryClient.clear();
			return;
		}
		AuthStore.clear();
		setAuthenticated(false);
		queryClient.clear();
	};

	const logout = async () => {
		const authentication = beginAuthenticationChange();
		let failure: unknown;
		try {
			await logoutSession();
		} catch (err) {
			failure = err;
		}
		if (!AuthStore.isCurrent(authentication)) return;
		clearCurrentSession();
		setAuthenticated(AuthStore.hasActiveToken());
		if (failure) {
			setLogoutUnconfirmed(true);
			throw new Error("logout_unconfirmed");
		}
		setLogoutUnconfirmed(false);
	};

	const refresh = async () => {
		const authentication = AuthStore.snapshot();
		const response = await refreshToken();
		if (!AuthStore.isCurrent(authentication)) return;
		AuthStore.replaceTop(response);
		setAuthenticated(true);
	};

	useIntervalWhen(
		() => {
			if (authenticated) {
				void refresh().catch(() => undefined);
			}
		},
		tokenRefreshInterval,
		true,
	);

	useEffect(() => {
		const invalidate = () => {
			AuthStore.clear();
			queryClient.clear();
			setAuthenticated(false);
			setTwoFactorChallenge(null);
		};
		const syncStorage = (event: StorageEvent) => {
			if (event.key !== TOKEN_KEY) return;
			AuthStore.invalidatePending();
			queryClient.clear();
			setAuthenticated(AuthStore.hasActiveToken());
			setTwoFactorChallenge(null);
		};
		window.addEventListener(AUTH_INVALIDATED_EVENT, invalidate);
		window.addEventListener("storage", syncStorage);
		return () => {
			window.removeEventListener(AUTH_INVALIDATED_EVENT, invalidate);
			window.removeEventListener("storage", syncStorage);
		};
	}, [queryClient]);

	const value = {
		authenticated,
		twoFactorChallenge,
		login,
		verifyTwoFactor,
		cancelTwoFactor,
		loginAs,
		completeSSO,
		logout,
		logoutUnconfirmed,
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
