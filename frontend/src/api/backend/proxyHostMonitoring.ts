import * as api from "./base";
import type { ProxyHostMonitoringConfig, ProxyHostMonitoringSnapshot, ProxyHostMonitoringTimePoint } from "./models";

export async function getProxyHostMonitoring(
	id: number,
	params: { from?: string; to?: string } = {},
): Promise<ProxyHostMonitoringSnapshot> {
	return await api.get({ url: `/nginx/proxy-hosts/${id}/monitoring`, params });
}

export async function getProxyHostMonitoringTimeseries(
	id: number,
	params: { from?: string; to?: string; resolution?: "minute" | "hour" } = {},
): Promise<ProxyHostMonitoringTimePoint[]> {
	return await api.get({ url: `/nginx/proxy-hosts/${id}/monitoring/timeseries`, params });
}

export async function updateProxyHostMonitoring(
	id: number,
	data: Partial<ProxyHostMonitoringConfig>,
): Promise<ProxyHostMonitoringConfig> {
	return await api.put({ url: `/nginx/proxy-hosts/${id}/monitoring`, data });
}

export async function probeProxyHost(id: number) {
	return await api.post({ url: `/nginx/proxy-hosts/${id}/monitoring/probe` });
}
