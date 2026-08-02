import * as api from "./base";
import type { NginxConfigArtifactResponse } from "./models";

export const getProxyHostNginxConfig = async (id: number, includeContent = ["deployed", "candidate"]): Promise<NginxConfigArtifactResponse> =>
	api.get({ url: `/nginx/proxy-hosts/${id}/nginx-config`, params: { include_content: includeContent.join(",") } });
