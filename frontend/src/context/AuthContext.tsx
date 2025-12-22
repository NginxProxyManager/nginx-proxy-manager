import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useState, useEffect } from "react";
import { useIntervalWhen } from "rooks";
import { getToken, loginAsUser, deleteToken, refreshToken, type TokenResponse } from "src/api/backend";
import AuthStore from "src/modules/AuthStore";

// Context
export interface AuthContextType {
	authenticated: boolean;
	login: (username: string, password: string) => Promise<void>;
	loginAs: (id: number) => Promise<void>;
	logout: () => void;
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

	const handleTokenUpdate = (response: TokenResponse) => {
		AuthStore.set(response);
		setAuthenticated(true);
	};

	const login = async (identity: string, secret: string) => {
		const response = await getToken(identity, secret);
		handleTokenUpdate(response);
	};

	const loginAs = async (id: number) => {
		const response = await loginAsUser(id);
		AuthStore.add(response);
		queryClient.clear();
		window.location.reload();
	};

	const logout = () => {
		deleteToken();
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

	const refresh = async (reload = true) => {
		const response = await refreshToken(reload);
		handleTokenUpdate(response);
	};

	useEffect(() => {
		if (!authenticated) {
			refresh(false).catch(() => {});
		}
	});

	useIntervalWhen(
		() => {
			if (authenticated) {
				refresh();
			}
		},
		tokenRefreshInterval,
		true,
	);

	const value = { authenticated, login, logout, loginAs };

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
