import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { linkOidcIdentity } from "src/api/backend";
import { showError, showObjectSuccess } from "src/notifications";

/**
 * Checks for a pending OIDC account-link result on mount.
 *
 * Flow:
 * 1. User clicks "Link Account" > PKCE params stored in sessionStorage > full-page redirect to IdP
 * 2. IdP redirects to /api/oidc/link-callback > full query string stored in localStorage > redirect to /
 * 3. SPA loads > this hook finds both storage items > calls POST /api/oidc/link > cleans up
 *
 * IMPORTANT: Must only run when the user is authenticated — the POST /api/oidc/link
 * endpoint requires a valid JWT. If fired before authentication is established, the
 * 401 response triggers AuthStore.clear() + page reload, permanently consuming the
 * one-shot link data from storage.
 *
 * @param authenticated - Whether the user is currently authenticated
 */
export function usePendingOidcLink(authenticated: boolean) {
	const queryClient = useQueryClient();
	const processed = useRef(false);

	useEffect(() => {
		if (processed.current || !authenticated) return;

		const resultRaw = localStorage.getItem("oidc_link_result");
		const pendingRaw = sessionStorage.getItem("oidc_link_pending");

		if (!resultRaw || !pendingRaw) return;

		// Mark as processed immediately to prevent double-execution
		processed.current = true;
		localStorage.removeItem("oidc_link_result");
		sessionStorage.removeItem("oidc_link_pending");

		(async () => {
			try {
				const result = JSON.parse(resultRaw);
				const pending = JSON.parse(pendingRaw);

				if (result.error) {
					// User cancelled or provider returned an error — not a failure
					if (result.error !== "access_denied") {
						showError(`OIDC provider error: ${result.error}`);
					}
					return;
				}

				if (!result.qs) {
					showError("No callback data received from provider");
					return;
				}

				await linkOidcIdentity({
					providerId: pending.providerId,
					codeVerifier: pending.codeVerifier,
					nonce: pending.nonce,
					callbackUrl: pending.callbackUrl,
					state: pending.state,
					queryString: result.qs,
				});

				// Refresh identities and user data
				queryClient.invalidateQueries({ queryKey: ["oidc-identities"] });
				queryClient.invalidateQueries({ queryKey: ["user", "me"] });
				showObjectSuccess("linked-account", "saved");
			} catch (err: any) {
				showError(err.message || "Failed to complete account linking");
			}
		})();
	}, [queryClient, authenticated]);
}
