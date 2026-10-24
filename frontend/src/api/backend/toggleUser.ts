import { updateUser } from "./updateUser";

export async function toggleUser(id: number, enabled: boolean): Promise<boolean> {
	await updateUser({
		id,
		isDisabled: !enabled,
	});
	return true;
}
