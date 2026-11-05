import { describe, expect, it } from "vitest";
import { type ApiError, buildApiError, isApiError, processResponse } from "./base";

const json = (body: unknown, status: number) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const catchError = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (err) {
		return err;
	}
	throw new Error("expected a rejection");
};

describe("ApiError parsing", () => {
	it("keeps the backend message, and reads message_i18n from the raw payload", async () => {
		const err = await catchError(
			processResponse(
				json(
					{ error: { code: 400, message: "Invalid email or password", message_i18n: "error.invalid-auth" } },
					400,
				),
			),
		);
		expect(isApiError(err)).toBe(true);
		const e = err as ApiError;
		expect(e).toBeInstanceOf(Error);
		expect(e.message).toBe("Invalid email or password");
		expect(e.messageI18n).toBe("error.invalid-auth");
		expect(e.code).toBe(400);
		expect(e.status).toBe(400);
		expect(e.details).toBeUndefined();
	});

	it("camelizes details of an nginx config error", async () => {
		const err = (await catchError(
			processResponse(
				json(
					{
						error: {
							code: 400,
							message: 'Advanced configuration: unknown directive "proxy_passs" (line 3).',
							details: {
								kind: "nginx_config",
								scope: "host",
								host_type: "proxy_host",
								host_id: 12,
								nginx_output: 'nginx: [emerg] unknown directive "proxy_passs"',
							},
						},
					},
					400,
				),
			),
		)) as ApiError;
		expect(err.details).toEqual({
			kind: "nginx_config",
			scope: "host",
			hostType: "proxy_host",
			hostId: 12,
			nginxOutput: 'nginx: [emerg] unknown directive "proxy_passs"',
		});
	});

	it("keeps the partial summary of a failed regeneration", async () => {
		const err = (await catchError(
			processResponse(
				json(
					{
						error: {
							code: 500,
							message: "Internal Error",
							regenerate_summary: {
								checked: 2,
								regenerated: 1,
								offline: [{ host_type: "proxy_host", id: 4, name: "broken.example.com", error: "bad" }],
								failed: [],
								warnings: [],
								duration_ms: 900,
							},
						},
					},
					500,
				),
			),
		)) as ApiError;
		expect(err.message).toBe("Internal Error");
		expect(err.details).toBeUndefined();
		expect(err.regenerateSummary).toEqual({
			checked: 2,
			regenerated: 1,
			offline: [{ hostType: "proxy_host", id: 4, name: "broken.example.com", error: "bad" }],
			failed: [],
			warnings: [],
			durationMs: 900,
		});
		// Other errors don't get one
		expect(
			buildApiError({ status: 409, statusText: "" }, { error: { message: "busy" } }).regenerateSummary,
		).toBeUndefined();
		expect(
			buildApiError({ status: 500, statusText: "" }, { error: { message: "x", regenerate_summary: "nope" } })
				.regenerateSummary,
		).toBeUndefined();
	});

	it("tolerates a non-JSON error body", async () => {
		const err = (await catchError(
			processResponse(new Response("<html>Bad Gateway</html>", { status: 502, statusText: "Bad Gateway" })),
		)) as ApiError;
		expect(isApiError(err)).toBe(true);
		expect(err.status).toBe(502);
		expect(err.code).toBe(502);
		expect(err.message).toBe("Request failed: 502 Bad Gateway");
	});

	it("tolerates an empty error body and a payload without error object", () => {
		expect(buildApiError({ status: 500, statusText: "" }, null).message).toBe("Request failed: 500");
		expect(buildApiError({ status: 404, statusText: "" }, { foo: 1 }).code).toBe(404);
		expect(buildApiError({ status: 400, statusText: "" }, { error: { message: "" } }).message).toBe(
			"Request failed: 400",
		);
	});

	it("keeps the legacy precedence of a raw camelCase messageI18n over message", async () => {
		const err = (await catchError(
			processResponse(json({ error: { message: "fallback", messageI18n: "certificate-error" } }, 500)),
		)) as ApiError;
		expect(err.message).toBe("certificate-error");
		expect(err.messageI18n).toBeUndefined();
		expect(buildApiError({ status: 400, statusText: "" }, { error: { message: "x", messageI18n: "" } }).message).toBe(
			"x",
		);
	});

	it("can skip camelizing a successful response", async () => {
		const res = await processResponse(json({ "test-domain.example": "ok" }, 200), true);
		expect(res).toEqual({ "test-domain.example": "ok" });
	});

	it("camelizes successful responses as before", async () => {
		const res = await processResponse(json({ forward_host: "app", meta: { nginx_online: true } }, 200));
		expect(res).toEqual({ forwardHost: "app", meta: { nginxOnline: true } });
	});
});
