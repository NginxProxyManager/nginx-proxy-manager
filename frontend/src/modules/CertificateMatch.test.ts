import { describe, expect, it } from "vitest";
import type { Certificate } from "src/api/backend";
import { matchCertificate } from "./CertificateMatch";

const cert = (id: number, ...domainNames: string[]) => ({ id, domainNames }) as Certificate;

describe("matchCertificate", () => {
	const wildcard = cert(1, "*.grasfer.app");
	const exact = cert(2, "pbs.grasfer.app");
	const other = cert(3, "example.com", "www.example.com");

	it("matches a wildcard cert one label deep", () => {
		expect(matchCertificate([wildcard, other], ["whatever.grasfer.app"])?.id).toEqual(1);
	});

	it("prefers an exact match over a wildcard", () => {
		expect(matchCertificate([wildcard, exact], ["pbs.grasfer.app"])?.id).toEqual(2);
		expect(matchCertificate([exact, wildcard], ["pbs.grasfer.app"])?.id).toEqual(2);
	});

	it("does not match a wildcard two labels deep", () => {
		expect(matchCertificate([wildcard], ["a.b.grasfer.app"])).toBeUndefined();
	});

	it("does not match the bare wildcard base domain", () => {
		expect(matchCertificate([wildcard], ["grasfer.app"])).toBeUndefined();
	});

	it("requires the cert to cover every typed domain", () => {
		// covering only one of two aliases would break TLS for the other
		expect(matchCertificate([other], ["nope.org", "www.example.com"])).toBeUndefined();
		expect(matchCertificate([wildcard], ["a.grasfer.app", "b.example.net"])).toBeUndefined();
	});

	it("matches when all domains are covered", () => {
		expect(matchCertificate([other], ["example.com", "www.example.com"])?.id).toEqual(3);
		expect(matchCertificate([wildcard], ["a.grasfer.app", "b.grasfer.app"])?.id).toEqual(1);
	});

	it("prefers a cert covering all domains exactly over a wildcard covering all", () => {
		const both = cert(4, "a.grasfer.app", "b.grasfer.app");
		expect(matchCertificate([wildcard, both], ["a.grasfer.app", "b.grasfer.app"])?.id).toEqual(4);
	});

	it("is case insensitive", () => {
		expect(matchCertificate([other], ["WWW.Example.COM"])?.id).toEqual(3);
	});

	it("returns undefined when nothing matches or input is empty", () => {
		expect(matchCertificate([wildcard, exact, other], ["unrelated.net"])).toBeUndefined();
		expect(matchCertificate([], ["whatever.grasfer.app"])).toBeUndefined();
		expect(matchCertificate([wildcard], [])).toBeUndefined();
	});
});
