import * as api from "./base";
import type { ProxyHost, ProxyHostPreview } from "./models";

export const previewProxyHostNginxConfig = async (payload: Partial<ProxyHost>): Promise<ProxyHostPreview> =>
	api.post({ url: "/nginx/proxy-hosts/nginx-config/preview", data: payload });
