import { describe, expect, it } from "vitest";
import { certificateFilesToFormData } from "./CertificateFilesFields";

const file = (name: string) => new File(["data"], name, { type: "text/plain" });

describe("certificateFilesToFormData", () => {
	it("uses the snake_case field names expected by the backend", () => {
		const formData = certificateFilesToFormData({
			certificate: file("cert.pem"),
			certificateKey: file("key.pem"),
			intermediateCertificate: file("chain.pem"),
		});

		expect([...formData.keys()].sort()).toEqual(["certificate", "certificate_key", "intermediate_certificate"]);
		expect((formData.get("certificate") as File).name).toBe("cert.pem");
		expect((formData.get("certificate_key") as File).name).toBe("key.pem");
		expect((formData.get("intermediate_certificate") as File).name).toBe("chain.pem");
	});

	it("leaves out the intermediate certificate when none is selected", () => {
		const formData = certificateFilesToFormData({
			certificate: file("cert.pem"),
			certificateKey: file("key.pem"),
			intermediateCertificate: null,
		});

		expect(formData.has("intermediate_certificate")).toBe(false);
		expect([...formData.keys()].sort()).toEqual(["certificate", "certificate_key"]);
	});
});
