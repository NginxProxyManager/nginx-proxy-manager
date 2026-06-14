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
