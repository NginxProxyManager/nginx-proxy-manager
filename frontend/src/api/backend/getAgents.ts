import * as api from "./base";
import type { Agent } from "./models";

export async function getAgents(): Promise<Agent[]> {
	return await api.get({ url: "/agents" });
}
