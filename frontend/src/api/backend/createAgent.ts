import * as api from "./base";
import type { Agent } from "./models";

export async function createAgent(item: Partial<Agent> & { secret: string }): Promise<Agent> {
	return await api.post({ url: "/agents", data: item });
}
