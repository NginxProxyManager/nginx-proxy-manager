import * as api from "./base";
import type { Agent } from "./models";

export async function updateAgent(item: Partial<Agent> & { id: number; secret?: string }): Promise<Agent> {
	const { id, ...data } = item;
	return await api.put({ url: `/agents/${id}`, data });
}
