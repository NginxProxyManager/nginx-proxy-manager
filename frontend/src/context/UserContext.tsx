import React, { useState, useEffect } from "react";

import { getUser, User } from "api/npm";
import { useAuthState } from "context";

// Context
const initalValue = null;
const UserContext = React.createContext<User | null>(initalValue);

// Provider
interface Props {
	children?: JSX.Element;
}
function UserProvider({ children }: Props) {
	const [userData, setUserData] = useState<User>({
		id: 0,
		name: "",
		nickname: "",
		email: "",
		createdOn: 0,
		updatedOn: 0,
		roles: [],
		gravatarUrl: "",
		isDisabled: false,
	});
	const { authenticated } = useAuthState();

	const fetchUserData = async () => {
		const response = await getUser();
		setUserData({ ...userData, ...response });
	};

	useEffect(() => {
		if (authenticated) {
			fetchUserData();
		}
		/* eslint-disable-next-line */
	}, [authenticated]);

	return (
		<UserContext.Provider value={userData}>{children}</UserContext.Provider>
	);
}

function useUserState() {
	const context = React.useContext(UserContext);
	if (!context) {
		throw new Error(`useUserState must be used within a UserProvider`);
	}
	return context;
}

export { UserProvider, useUserState };
export default UserContext;
