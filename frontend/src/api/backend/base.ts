import { QueryClient } from "@tanstack/react-query";
import { camelizeKeys, decamelize, decamelizeKeys } from "humps";
import queryString, { type StringifiableRecord } from "query-string";
import AuthStore from "src/modules/AuthStore";

const queryClient = new QueryClient();
const contentTypeHeader = "Content-Type";

interface BuildUrlArgs {
	url: string;
	params?: StringifiableRecord;
}

function decamelizeParams(params?: StringifiableRecord): StringifiableRecord | undefined {
	if (!params) {
		return undefined;
	}
	const result: StringifiableRecord = {};
	for (const [key, value] of Object.entries(params)) {
		result[decamelize(key)] = value;
	}

	return result;
}

function buildUrl({ url, params }: BuildUrlArgs) {
	const endpoint = url.replace(/^\/|\/$/g, "");
	const baseUrl = `/api/${endpoint}`;
	const apiUrl = queryString.stringifyUrl({
		url: baseUrl,
		query: decamelizeParams(params),
	});
	return apiUrl;
}

function buildAuthHeader(): Record<string, string> | undefined {
	if (AuthStore.token) {
		return { Authorization: `Bearer ${AuthStore.token.token}` };
	}
	return {};
}

function buildBody(data?: Record<string, any>): string | undefined {
	if (data) {
		return JSON.stringify(decamelizeKeys(data));
	}
}

/**
 * Structured detail the backend attaches to some public errors, such as a
 * NginxConfigError. Keys arrive camelized (`host_id` -> `hostId`).
 */
export type ApiErrorDetails = Record<string, any>;

interface ApiErrorOptions {
	status: number;
	code?: number;
	messageI18n?: string;
	details?: ApiErrorDetails;
	regenerateSummary?: Record<string, any>;
}

/**
 * Error thrown for every non-2xx API response.
 *
 * `message` is the backend's human readable message, exactly what the modals
 * have always shown, so every `err.message` consumer keeps working. The i18n
 * key (when the backend sends one) and any structured details are kept next
 * to it. Use `formatApiError()` to get the best displayable text.
 */
export class ApiError extends Error {
	/** HTTP status of the response */
	readonly status: number;
	/** `error.code` from the payload, falls back to the HTTP status */
	readonly code: number;
	/** `error.message_i18n` from the payload, if any */
	readonly messageI18n?: string;
	/** `error.details` from the payload (camelized), if any */
	readonly details?: ApiErrorDetails;
	/**
	 * `error.regenerate_summary` from the payload (camelized), if any: what a
	 * regeneration of all host configs did before it failed
	 */
	readonly regenerateSummary?: Record<string, any>;

	constructor(message: string, { status, code, messageI18n, details, regenerateSummary }: ApiErrorOptions) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = typeof code === "number" ? code : status;
		this.messageI18n = messageI18n;
		this.details = details;
		this.regenerateSummary = regenerateSummary;
	}
}

export const isApiError = (err: unknown): err is ApiError => err instanceof ApiError;

/**
 * Builds an ApiError from a failed response and its (raw, snake_case) payload.
 * The payload may be anything: null for an empty or non-JSON body (e.g. a 502
 * page from a proxy in front of NPM).
 */
export function buildApiError(response: Pick<Response, "status" | "statusText">, payload: any): ApiError {
	const error = payload && typeof payload === "object" ? payload.error : undefined;
	const hasError = !!error && typeof error === "object";
	const statusText = response.statusText ? ` ${response.statusText}` : "";
	// Same precedence as before ApiError existed: a raw camelCase `messageI18n`
	// wins over `message`, so callers that throw translated keys keep working.
	const message =
		hasError && typeof error.messageI18n === "string" && error.messageI18n !== ""
			? error.messageI18n
			: hasError && typeof error.message === "string" && error.message !== ""
				? error.message
				: `Request failed: ${response.status}${statusText}`;
	const messageI18n =
		hasError && typeof error.message_i18n === "string" && error.message_i18n !== ""
			? error.message_i18n
			: undefined;
	const details =
		hasError && error.details && typeof error.details === "object"
			? (camelizeKeys(error.details) as ApiErrorDetails)
			: undefined;
	const regenerateSummary =
		hasError && error.regenerate_summary && typeof error.regenerate_summary === "object"
			? (camelizeKeys(error.regenerate_summary) as Record<string, any>)
			: undefined;
	return new ApiError(message, {
		status: response.status,
		code: hasError && typeof error.code === "number" ? error.code : undefined,
		messageI18n,
		details,
		regenerateSummary,
	});
}

async function readPayload(response: Response): Promise<any> {
	const text = await response.text();
	if (!text) {
		return null;
	}
	try {
		return JSON.parse(text);
	} catch (err) {
		if (response.ok) {
			// A successful response that isn't JSON is a server bug; fail loudly as before.
			throw err;
		}
		return null;
	}
}

export async function processResponse(response: Response, preserveResponseKeys = false) {
	const payload = await readPayload(response);
	if (!response.ok) {
		if (response.status === 401) {
			// Force logout user and reload the page if Unauthorized
			AuthStore.clear();
			queryClient.clear();
			window.location.reload();
		}
		throw buildApiError(response, payload);
	}
	return (preserveResponseKeys ? payload : camelizeKeys(payload)) as any;
}

interface GetArgs {
	url: string;
	params?: queryString.StringifiableRecord;
}

async function baseGet({ url, params }: GetArgs, abortController?: AbortController) {
	const apiUrl = buildUrl({ url, params });
	const method = "GET";
	const headers = buildAuthHeader();
	const signal = abortController?.signal;
	const response = await fetch(apiUrl, { method, headers, signal });
	return response;
}

export async function get(args: GetArgs, abortController?: AbortController) {
	return processResponse(await baseGet(args, abortController));
}

export async function download({ url, params }: GetArgs, filename = "download.file") {
	const headers = buildAuthHeader();
	const res = await fetch(buildUrl({ url, params }), { headers });
	const bl = await res.blob();
	const u = window.URL.createObjectURL(bl);
	const a = document.createElement("a");
	a.href = u;
	a.download = filename;
	a.click();
	window.URL.revokeObjectURL(url);
}

interface PostArgs {
	url: string;
	params?: queryString.StringifiableRecord;
	data?: any;
	noAuth?: boolean;
	preserveResponseKeys?: boolean;
}

export async function post({ url, params, data, noAuth, preserveResponseKeys }: PostArgs, abortController?: AbortController) {
	const apiUrl = buildUrl({ url, params });
	const method = "POST";

	let headers: Record<string, string> = {};
	if (!noAuth) {
		headers = {
			...buildAuthHeader(),
		};
	}

	let body: string | FormData | undefined;
	// Check if the data is an instance of FormData
	// If data is FormData, let the browser set the Content-Type header
	if (data instanceof FormData) {
		body = data;
	} else {
		// If data is JSON, set the Content-Type header to 'application/json'
		headers = {
			...headers,
			[contentTypeHeader]: "application/json",
		};
		body = buildBody(data);
	}

	const signal = abortController?.signal;
	const response = await fetch(apiUrl, { method, headers, body, signal });
	return processResponse(response, preserveResponseKeys);
}

interface PutArgs {
	url: string;
	params?: queryString.StringifiableRecord;
	data?: Record<string, any>;
}
export async function put({ url, params, data }: PutArgs, abortController?: AbortController) {
	const apiUrl = buildUrl({ url, params });
	const method = "PUT";
	const headers = {
		...buildAuthHeader(),
		[contentTypeHeader]: "application/json",
	};
	const signal = abortController?.signal;
	const body = buildBody(data);
	const response = await fetch(apiUrl, { method, headers, body, signal });
	return processResponse(response);
}

interface DeleteArgs {
	url: string;
	params?: queryString.StringifiableRecord;
}
export async function del({ url, params }: DeleteArgs, abortController?: AbortController) {
	const apiUrl = buildUrl({ url, params });
	const method = "DELETE";
	const headers = {
		...buildAuthHeader(),
	};
	const signal = abortController?.signal;
	const response = await fetch(apiUrl, { method, headers, signal });
	return processResponse(response);
}
