import React, { ReactNode, useState, useEffect, useCallback } from "react";

import { HealthResponse, requestHealth } from "api/npm";
import { Unhealthy } from "components";
import { useInterval } from "rooks";

interface HealthResponseLoaded extends HealthResponse {
	loading: boolean;
}
export interface HealthContextType {
	health: HealthResponseLoaded;
	refreshHealth: () => void;
}

const initalValue = null;
const HealthContext =
	React.createContext<HealthContextType | null>(initalValue);

interface Props {
	children: ReactNode;
}
function HealthProvider({ children }: Props) {
	const [health, setHealth] = useState({
		loading: true,
		commit: "",
		healthy: false,
		setup: false,
		errorReporting: true,
		version: "",
	});

	const handleHealthUpdate = (response: HealthResponse) => {
		setHealth({ ...response, loading: false });
	};

	const refreshHealth = async () => {
		const response = await requestHealth();
		handleHealthUpdate(response);
	};

	const asyncFetch = useCallback(async () => {
		try {
			const response = await requestHealth();
			handleHealthUpdate(response);
			if (response.healthy) {
				if (!health.loading && health.commit !== response.commit) {
					// New backend version detected, let's reload the entire window
					window.location.assign(`?hash=${response.commit}`);
				}
			}
		} catch ({ message }) {
			console.error("Health failed:", message);
		}
	}, [health.commit, health.loading]);

	useEffect(() => {
		asyncFetch();
	}, [asyncFetch]);

	useInterval(asyncFetch, 30 * 1000, true);

	if (!health.loading && !health.healthy) {
		return <Unhealthy />;
	}

	const value = { health, refreshHealth };

	return (
		<HealthContext.Provider value={value}>{children}</HealthContext.Provider>
	);
}

function useHealthState() {
	const context = React.useContext(HealthContext);
	if (!context) {
		throw new Error(`useHealthState must be used within a HealthProvider`);
	}
	return context;
}

export { HealthProvider, useHealthState };
export default HealthContext;
