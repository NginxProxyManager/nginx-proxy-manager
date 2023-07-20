import { ReactNode, createContext, useContext, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { useIntervalWhen } from "rooks";

import { getToken, refreshToken, TokenResponse } from "src/api/npm";
import AuthStore from "src/modules/AuthStore";

// Context
export interface AuthContextType {
	authenticated: boolean;
	login: (username: string, password: string) => Promise<void>;
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
function AuthProvider({
	children,
	tokenRefreshInterval = 5 * 60 * 1000,
}: Props) {
	const queryClient = useQueryClient();
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

	const value = { authenticated, login, logout };

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthState() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error(`useAuthState must be used within a AuthProvider`);
	}
	return context;
}

export { AuthProvider, useAuthState };
export default AuthContext;
