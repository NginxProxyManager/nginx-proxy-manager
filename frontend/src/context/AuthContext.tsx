import React, { ReactNode, useState } from "react";

import { getToken, refreshToken, TokenResponse } from "api/npm";
import AuthStore from "modules/AuthStore";
import { useInterval } from "rooks";

// Context
export interface AuthContextType {
	authenticated: boolean;
	login: (username: string, password: string) => Promise<void>;
	logout: () => void;
	token?: string;
}

const initalValue = null;
const AuthContext = React.createContext<AuthContextType | null>(initalValue);

// Provider
interface Props {
	children?: ReactNode;
	tokenRefreshInterval?: number;
}
function AuthProvider({
	children,
	tokenRefreshInterval = 5 * 60 * 1000,
}: Props) {
	const [authenticated, setAuthenticated] = useState(
		AuthStore.hasActiveToken(),
	);

	const handleTokenUpdate = (response: TokenResponse) => {
		AuthStore.set(response);
		setAuthenticated(true);
	};

	const login = async (identity: string, secret: string) => {
		const type = "password";
		const response = await getToken({ payload: { type, identity, secret } });
		handleTokenUpdate(response);
	};

	const logout = () => {
		AuthStore.clear();
		setAuthenticated(false);
	};

	const refresh = async () => {
		const response = await refreshToken();
		handleTokenUpdate(response);
	};

	useInterval(
		() => {
			if (authenticated) {
				refresh();
			}
		},
		tokenRefreshInterval,
		true,
	);

	const value = { authenticated, login, logout };

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthState() {
	const context = React.useContext(AuthContext);
	if (!context) {
		throw new Error(`useAuthState must be used within a AuthProvider`);
	}
	return context;
}

export { AuthProvider, useAuthState };
export default AuthContext;
