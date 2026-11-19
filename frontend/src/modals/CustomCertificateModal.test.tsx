import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { makeFile, renderWithProviders, selectFiles } from "src/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showCustomCertificateModal } from "./CustomCertificateModal";

const api = vi.hoisted(() => ({
	validateCertificate: vi.fn(),
	createCertificate: vi.fn(),
	uploadCertificate: vi.fn(),
}));
const notifications = vi.hoisted(() => ({ showObjectSuccess: vi.fn() }));

vi.mock("src/api/backend", async (importOriginal) => ({
	...(await importOriginal<typeof import("src/api/backend")>()),
	...api,
}));
vi.mock("src/notifications", async (importOriginal) => ({
	...(await importOriginal<typeof import("src/notifications")>()),
	...notifications,
}));

const NEW_ID = 99;

describe("CustomCertificateModal", () => {
	beforeEach(() => {
		api.validateCertificate.mockResolvedValue({ certificate: { cn: "example.com" }, certificateKey: true });
		api.createCertificate.mockResolvedValue({ id: NEW_ID, niceName: "My cert", provider: "other" });
		api.uploadCertificate.mockResolvedValue({ certificate: "x", certificateKey: "y" });
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("validates, creates and then uploads the files to the new certificate", async () => {
		renderWithProviders();
		act(() => showCustomCertificateModal());
		await screen.findByRole("dialog");

		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My cert" } });
		selectFiles(screen.getByLabelText("Certificate Key"), [makeFile("key.pem")]);
		selectFiles(screen.getByLabelText("Certificate"), [makeFile("cert.pem")]);
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

		expect(api.validateCertificate).toHaveBeenCalledTimes(1);
		expect(api.createCertificate).toHaveBeenCalledTimes(1);
		expect(api.uploadCertificate).toHaveBeenCalledTimes(1);

		const [validateOrder] = api.validateCertificate.mock.invocationCallOrder;
		const [createOrder] = api.createCertificate.mock.invocationCallOrder;
		const [uploadOrder] = api.uploadCertificate.mock.invocationCallOrder;
		expect(validateOrder).toBeLessThan(createOrder);
		expect(createOrder).toBeLessThan(uploadOrder);

		expect(api.createCertificate).toHaveBeenCalledWith(
			expect.objectContaining({ niceName: "My cert", provider: "other" }),
		);
		const [uploadId, formData] = api.uploadCertificate.mock.calls[0];
		expect(uploadId).toBe(NEW_ID);
		expect((formData.get("certificate") as File).name).toBe("cert.pem");
		expect((formData.get("certificate_key") as File).name).toBe("key.pem");
		expect(formData.has("intermediate_certificate")).toBe(false);
		// the same validated files are uploaded
		expect(formData).toBe(api.validateCertificate.mock.calls[0][0]);
		expect(notifications.showObjectSuccess).toHaveBeenCalledWith("certificate", "saved");
	});

	it("does not create a certificate when validation fails", async () => {
		api.validateCertificate.mockRejectedValue(new Error("Certificate is not valid"));
		renderWithProviders();
		act(() => showCustomCertificateModal());
		await screen.findByRole("dialog");

		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My cert" } });
		selectFiles(screen.getByLabelText("Certificate Key"), [makeFile("key.pem")]);
		selectFiles(screen.getByLabelText("Certificate"), [makeFile("cert.pem")]);
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		expect(await screen.findByText("Certificate is not valid")).toBeInTheDocument();
		expect(api.createCertificate).not.toHaveBeenCalled();
		expect(api.uploadCertificate).not.toHaveBeenCalled();
	});
});
