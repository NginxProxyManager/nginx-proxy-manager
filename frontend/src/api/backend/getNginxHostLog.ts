import * as api from "./base";
import type { NginxLogHostType, NginxLogKind, NginxLogSnapshot } from "./models";

export const getNginxHostLog = async (
	hostType: NginxLogHostType,
	hostId: number,
	logKind: NginxLogKind,
	tailLines = 200,
): Promise<NginxLogSnapshot> =>
	api.get({ url: `/nginx/${hostType}/${hostId}/logs/${logKind}`, params: { tail_lines: tailLines } });
