import { camelizeKeys, decamelizeKeys } from "humps";
import queryString from "query-string";

import AuthStore from "src/modules/AuthStore";

const contentTypeHeader = "Content-Type";

interface BuildUrlArgs {
	url: string;
	params?: queryString.StringifiableRecord;
}
function buildUrl({ url, params }: BuildUrlArgs) {
	const endpoint = url.replace(/^\/|\/$/g, "");
	const apiParams = params ? `?${queryString.stringify(params)}` : "";
	const apiUrl = `/api/${endpoint}${apiParams}`;
	return apiUrl;
}

function buildAuthHeader(): Record<string, string> | undefined {
	if (AuthStore.token) {
		return { Authorization: `Bearer ${AuthStore.token.token}` };
	}
	return {};
}

function buildBody(data?: Record<string, any>, skipDecamelize = false) {
	if (data) {
		return JSON.stringify(skipDecamelize ? data : decamelizeKeys(data));
	}
}

async function processResponse(response: Response, skipCamelize = false) {
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error.message);
	}
	return (skipCamelize ? payload : camelizeKeys(payload)) as any;
}

interface GetArgs {
	url: string;
	params?: queryString.StringifiableRecord;
	skipCamelize?: boolean;
}

export async function get(
	{ url, params, skipCamelize }: GetArgs,
	abortController?: AbortController,
) {
	const apiUrl = buildUrl({ url, params });
	const method = "GET";
	const signal = abortController?.signal;
	const headers = buildAuthHeader();
	const response = await fetch(apiUrl, { method, headers, signal });
	return processResponse(response, skipCamelize);
}

interface PostArgs {
	url: string;
	data?: any;
	skipCamelize?: boolean;
	skipDecamelize?: boolean;
}

export async function post(
	{ url, data, skipCamelize, skipDecamelize }: PostArgs,
	abortController?: AbortController,
) {
	const apiUrl = buildUrl({ url });
	const method = "POST";
	const headers = {
		...buildAuthHeader(),
		[contentTypeHeader]: "application/json",
	};
	const signal = abortController?.signal;
	const body = buildBody(data, skipDecamelize);
	const response = await fetch(apiUrl, { method, headers, body, signal });
	return processResponse(response, skipCamelize);
}

interface PutArgs {
	url: string;
	data?: any;
	skipCamelize?: boolean;
	skipDecamelize?: boolean;
}
export async function put(
	{ url, data, skipCamelize, skipDecamelize }: PutArgs,
	abortController?: AbortController,
) {
	const apiUrl = buildUrl({ url });
	const method = "PUT";
	const headers = {
		...buildAuthHeader(),
		[contentTypeHeader]: "application/json",
	};
	const signal = abortController?.signal;
	const body = buildBody(data, skipDecamelize);
	const response = await fetch(apiUrl, { method, headers, body, signal });
	return processResponse(response, skipCamelize);
}

interface DeleteArgs {
	url: string;
}
export async function del(
	{ url }: DeleteArgs,
	abortController?: AbortController,
) {
	const apiUrl = buildUrl({ url });
	const method = "DELETE";
	const headers = {
		...buildAuthHeader(),
		[contentTypeHeader]: "application/json",
	};
	const signal = abortController?.signal;
	const response = await fetch(apiUrl, { method, headers, signal });
	return processResponse(response);
}
