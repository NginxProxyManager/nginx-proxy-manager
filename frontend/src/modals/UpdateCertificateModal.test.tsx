import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { formatDateTime } from "src/locale";
import { makeFile, renderWithProviders, selectFiles } from "src/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showUpdateCertificateModal } from "./UpdateCertificateModal";

const api = vi.hoisted(() => ({
	getCertificate: vi.fn(),
	validateCertificate: vi.fn(),
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

const CERT_ID = 42;
const CURRENT_EXPIRES = "2026-11-01 10:00:00";
// 2031-06-15T12:00:00Z, unix seconds as returned by the validate endpoint
const NEW_EXPIRES_UNIX = 1939291200;

const certificate = {
	id: CERT_ID,
	createdOn: "2025-01-01 00:00:00",
	modifiedOn: "2025-01-01 00:00:00",
	ownerUserId: 1,
	provider: "other",
	niceName: "Intranet wildcard",
	domainNames: ["intranet.example.com"],
	expiresOn: CURRENT_EXPIRES,
	meta: {},
};

const validResponse = (cn: string) => ({
	certificate: { cn, issuer: "C = US, O = Example CA", dates: { from: 1700000000, to: NEW_EXPIRES_UNIX } },
	certificateKey: true,
});

const openModal = async () => {
	const utils = renderWithProviders();
	act(() => showUpdateCertificateModal(CERT_ID));
	const dialog = await screen.findByRole("dialog");
	await within(dialog).findByText(/Intranet wildcard/);
	return { ...utils, dialog };
};

const selectFile = (label: string, file: File | null) => {
	selectFiles(screen.getByLabelText(label), file ? [file] : []);
};

const selectRequiredFiles = () => {
	selectFile("Certificate Key", makeFile("key.pem"));
	selectFile("Certificate", makeFile("cert.pem"));
};

const clickButton = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("UpdateCertificateModal", () => {
	beforeEach(() => {
		api.getCertificate.mockResolvedValue(certificate);
		api.validateCertificate.mockResolvedValue(validResponse("intranet.example.com"));
		api.uploadCertificate.mockResolvedValue({ certificate: "x", certificateKey: "y" });
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("shows the certificate name and its current expiry", async () => {
		const { dialog } = await openModal();

		expect(api.getCertificate).toHaveBeenCalledWith(CERT_ID, ["owner"]);
		expect(within(dialog).getByText("Update Certificate")).toBeInTheDocument();
		expect(within(dialog).getByText(/Intranet wildcard/)).toBeInTheDocument();
		expect(within(dialog).getByText("Current expiry")).toBeInTheDocument();
		expect(within(dialog).getByText(formatDateTime(CURRENT_EXPIRES, "en"))).toBeInTheDocument();
	});

	it("does not validate until the certificate and key files are selected", async () => {
		await openModal();

		clickButton("Validate");
		await act(async () => {});
		expect(api.validateCertificate).not.toHaveBeenCalled();

		selectFile("Certificate Key", makeFile("key.pem"));
		clickButton("Validate");
		await act(async () => {});
		expect(api.validateCertificate).not.toHaveBeenCalled();

		selectFile("Certificate", makeFile("cert.pem"));
		clickButton("Validate");
		await waitFor(() => expect(api.validateCertificate).toHaveBeenCalledTimes(1));
		expect(api.uploadCertificate).not.toHaveBeenCalled();
	});

	it("shows the new common name and expiry date after validation", async () => {
		await openModal();
		selectRequiredFiles();
		clickButton("Validate");

		expect(await screen.findByText("New common name")).toBeInTheDocument();
		expect(screen.getByText("intranet.example.com", { selector: "dd" })).toBeInTheDocument();
		const newExpiry = screen.getByText(formatDateTime(NEW_EXPIRES_UNIX, "en"));
		expect(newExpiry).toBeInTheDocument();
		// unix seconds must not be read as milliseconds (which would land in 1970)
		expect(newExpiry.textContent).toContain("2031");
		expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Validate" })).not.toBeInTheDocument();
		expect(api.uploadCertificate).not.toHaveBeenCalled();
	});

	it("does not warn when the common name matches a current domain", async () => {
		await openModal();
		selectRequiredFiles();
		clickButton("Validate");

		await screen.findByText("New common name");
		expect(screen.queryByText(/does not match the current domains/)).not.toBeInTheDocument();
	});

	it("warns when the common name is not one of the current domains", async () => {
		api.validateCertificate.mockResolvedValue(validResponse("other.example.org"));
		await openModal();
		selectRequiredFiles();
		clickButton("Validate");

		const warning = await screen.findByText(/does not match the current domains/);
		expect(warning).toHaveTextContent("other.example.org");
		expect(warning).toHaveTextContent("intranet.example.com");
	});

	it("goes back to the validate step when a file changes after validation", async () => {
		await openModal();
		selectRequiredFiles();
		clickButton("Validate");
		await screen.findByText("New common name");

		selectFile("Intermediate Certificate", makeFile("chain.pem"));

		expect(screen.queryByText("New common name")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Validate" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument();

		clickButton("Validate");
		await waitFor(() => expect(api.validateCertificate).toHaveBeenCalledTimes(2));
		expect(api.uploadCertificate).not.toHaveBeenCalled();
	});

	it("ignores a validation response for files that are no longer selected", async () => {
		const staleExpires = 1970000000;
		let resolveStale: (value: unknown) => void = () => {};
		api.validateCertificate.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveStale = resolve;
				}),
		);
		await openModal();
		selectRequiredFiles();
		clickButton("Validate");
		await waitFor(() => expect(api.validateCertificate).toHaveBeenCalledTimes(1));

		// the user picks another certificate while the first one is still being validated
		selectFile("Certificate", makeFile("other-cert.pem"));
		await act(async () => {
			resolveStale({
				certificate: { cn: "stale.example.org", dates: { from: 1700000000, to: staleExpires } },
				certificateKey: true,
			});
		});

		expect(screen.queryByText("New common name")).not.toBeInTheDocument();
		expect(screen.queryByText("stale.example.org")).not.toBeInTheDocument();
		expect(screen.queryByText(formatDateTime(staleExpires, "en"))).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Validate" })).toBeEnabled();
		expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument();
	});

	it("ignores a validation error for files that are no longer selected", async () => {
		let rejectStale: (reason: unknown) => void = () => {};
		api.validateCertificate.mockImplementationOnce(
			() =>
				new Promise((_resolve, reject) => {
					rejectStale = reject;
				}),
		);
		await openModal();
		selectRequiredFiles();
		clickButton("Validate");
		await waitFor(() => expect(api.validateCertificate).toHaveBeenCalledTimes(1));

		selectFile("Certificate", makeFile("other-cert.pem"));
		await act(async () => {
			rejectStale(new Error("Certificate is not valid"));
		});

		expect(screen.queryByText("Certificate is not valid")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Validate" })).toBeEnabled();
	});

	it("uploads to the same certificate id, refreshes queries and closes", async () => {
		const { queryClient } = await openModal();
		const invalidate = vi.spyOn(queryClient, "invalidateQueries");
		selectRequiredFiles();
		selectFile("Intermediate Certificate", makeFile("chain.pem"));
		clickButton("Validate");
		await screen.findByText("New common name");

		clickButton("Update");

		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
		expect(api.uploadCertificate).toHaveBeenCalledTimes(1);
		const [id, formData] = api.uploadCertificate.mock.calls[0];
		expect(id).toBe(CERT_ID);
		expect(formData).toBeInstanceOf(FormData);
		expect((formData.get("certificate") as File).name).toBe("cert.pem");
		expect((formData.get("certificate_key") as File).name).toBe("key.pem");
		expect((formData.get("intermediate_certificate") as File).name).toBe("chain.pem");
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["certificates"] });
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["certificate", CERT_ID] });
		expect(notifications.showObjectSuccess).toHaveBeenCalledWith("certificate", "saved");
	});

	it("shows the validation error and does not upload", async () => {
		api.validateCertificate.mockRejectedValue(new Error("Certificate is not valid"));
		await openModal();
		selectRequiredFiles();
		clickButton("Validate");

		expect(await screen.findByText("Certificate is not valid")).toBeInTheDocument();
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Validate" })).toBeInTheDocument();
		expect(api.uploadCertificate).not.toHaveBeenCalled();
	});

	it("shows the upload error and keeps the modal open", async () => {
		api.uploadCertificate.mockRejectedValue(new Error("Certificate and key do not match"));
		await openModal();
		selectRequiredFiles();
		clickButton("Validate");
		await screen.findByText("New common name");

		clickButton("Update");

		expect(await screen.findByText("Certificate and key do not match")).toBeInTheDocument();
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
		expect(notifications.showObjectSuccess).not.toHaveBeenCalled();
	});
});
