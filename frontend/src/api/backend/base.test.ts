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
							message: 'Custom location "/api": host "foo" could not be resolved.',
							details: {
								kind: "nginx_config",
								scope: "location",
								host_type: "proxy_host",
								host_id: 12,
								location_index: 0,
								location_path: "/api",
								nginx_output: "nginx: [emerg] host not found",
							},
						},
					},
					400,
				),
			),
		)) as ApiError;
		expect(err.details).toEqual({
			kind: "nginx_config",
			scope: "location",
			hostType: "proxy_host",
			hostId: 12,
			locationIndex: 0,
			locationPath: "/api",
			nginxOutput: "nginx: [emerg] host not found",
		});
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
