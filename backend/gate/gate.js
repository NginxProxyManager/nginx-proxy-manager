/**
 * Sign-in and security key registration pages for access lists.
 *
 * Served by Nginx Proxy Manager on the protected site at /.npm-auth/, with no build step,
 * so this is plain browser JavaScript.
 */
(() => {
	const $ = (id) => document.getElementById(id);

	const base64urlToBuffer = (value) => {
		const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	};

	const bufferToBase64url = (buffer) => {
		const bytes = new Uint8Array(buffer);
		let binary = "";
		for (const byte of bytes) {
			binary += String.fromCharCode(byte);
		}
		return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	};

	const api = async (path, body) => {
		const res = await fetch(`/.npm-auth/api/${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "same-origin",
			body: JSON.stringify(body),
		});
		let data = null;
		try {
			data = await res.json();
		} catch {
			// not JSON
		}
		if (!res.ok) {
			throw new Error(data?.error?.message || `Request failed (${res.status})`);
		}
		return data;
	};

	const showStatus = (message, kind) => {
		const el = $("status");
		el.textContent = message || "";
		el.className = kind === "ok" ? "status ok" : "status";
		el.hidden = !message;
	};

	// Only ever leave the sign-in page for a page on the same site
	const goBack = (target) => {
		const url = new URL(target || "/", window.location.origin);
		window.location.replace(url.origin === window.location.origin ? url.href : "/");
	};

	const browserSupportsKeys = () =>
		window.isSecureContext && typeof window.PublicKeyCredential !== "undefined" && !!navigator.credentials;

	const describeError = (err) => {
		switch (err?.name) {
			case "NotAllowedError":
			case "AbortError":
				return "The security key request was cancelled or timed out. Try again.";
			case "InvalidStateError":
				return "This security key is already registered.";
			case "SecurityError":
				return "Security keys can't be used on this address. Open the site over HTTPS using its domain name.";
			case "NotSupportedError":
				return "This browser or security key isn't supported.";
			default:
				return err?.message || "Something went wrong. Try again.";
		}
	};

	const toCreationOptions = (options) => ({
		...options,
		challenge: base64urlToBuffer(options.challenge),
		user: { ...options.user, id: base64urlToBuffer(options.user.id) },
		excludeCredentials: (options.excludeCredentials || []).map((c) => ({ ...c, id: base64urlToBuffer(c.id) })),
	});

	const toRequestOptions = (options) => ({
		...options,
		challenge: base64urlToBuffer(options.challenge),
		allowCredentials: (options.allowCredentials || []).map((c) => ({ ...c, id: base64urlToBuffer(c.id) })),
	});

	const registrationToJSON = (credential) => ({
		id: credential.id,
		rawId: bufferToBase64url(credential.rawId),
		type: credential.type,
		response: {
			clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
			attestationObject: bufferToBase64url(credential.response.attestationObject),
			transports:
				typeof credential.response.getTransports === "function" ? credential.response.getTransports() : [],
		},
		clientExtensionResults: credential.getClientExtensionResults?.() || {},
		authenticatorAttachment: credential.authenticatorAttachment || undefined,
	});

	const authenticationToJSON = (credential) => ({
		id: credential.id,
		rawId: bufferToBase64url(credential.rawId),
		type: credential.type,
		response: {
			clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
			authenticatorData: bufferToBase64url(credential.response.authenticatorData),
			signature: bufferToBase64url(credential.response.signature),
			userHandle: credential.response.userHandle ? bufferToBase64url(credential.response.userHandle) : undefined,
		},
		clientExtensionResults: credential.getClientExtensionResults?.() || {},
		authenticatorAttachment: credential.authenticatorAttachment || undefined,
	});

	const disableKeyButton = (hint) => {
		$("key-button").disabled = true;
		$("key-hint").textContent = hint;
	};

	const keysUnavailableHint =
		"Security keys only work over HTTPS on the site's domain name, in a browser that supports them.";

	const initLogin = async () => {
		const params = new URLSearchParams(window.location.search);
		const list = params.get("list");
		const rd = params.get("rd") || "/";

		let methods;
		try {
			methods = await api("methods", { list });
		} catch (err) {
			$("loading").hidden = true;
			showStatus(describeError(err));
			return;
		}
		$("loading").hidden = true;
		$("subtitle").textContent = `Sign in to continue to ${window.location.hostname}.`;

		if (methods.keys) {
			$("key-section").hidden = false;
			if (!browserSupportsKeys() || !methods.keys_supported) {
				disableKeyButton(keysUnavailableHint);
			} else if (!methods.key_count) {
				disableKeyButton(
					`No security keys are registered for ${methods.domain} yet. Ask your administrator for a registration link.`,
				);
			}
		}
		if (methods.password) {
			$("password-form").hidden = false;
		}
		if (methods.keys && methods.password) {
			$("divider").hidden = false;
		}
		if (!methods.keys && !methods.password) {
			showStatus("This site can't be signed in to from a browser.");
		}

		$("key-button").addEventListener("click", async () => {
			const button = $("key-button");
			showStatus("");
			button.disabled = true;
			try {
				const { ceremony, options } = await api("login/options", { list });
				const credential = await navigator.credentials.get({ publicKey: toRequestOptions(options) });
				const result = await api("login/verify", {
					list,
					ceremony,
					response: authenticationToJSON(credential),
					rd,
				});
				goBack(result.redirect);
			} catch (err) {
				showStatus(describeError(err));
				button.disabled = false;
			}
		});

		$("password-form").addEventListener("submit", async (event) => {
			event.preventDefault();
			const button = $("password-button");
			showStatus("");
			button.disabled = true;
			try {
				const result = await api("login/password", {
					list,
					username: $("username").value,
					password: $("password").value,
					rd,
				});
				goBack(result.redirect);
			} catch (err) {
				showStatus(describeError(err));
				$("password").value = "";
				button.disabled = false;
			}
		});
	};

	const initEnroll = async () => {
		const token = window.location.hash.slice(1);
		if (!token) {
			$("loading").hidden = true;
			showStatus("This registration link is incomplete. Copy the whole link from Nginx Proxy Manager.");
			return;
		}

		let info;
		try {
			info = await api("enroll/info", { token });
		} catch (err) {
			$("loading").hidden = true;
			showStatus(describeError(err));
			return;
		}
		$("loading").hidden = true;
		$("subtitle").textContent =
			`Add "${info.key_name}" to the access list "${info.list_name}". It will work on ${info.domain} and its subdomains.`;
		$("key-section").hidden = false;

		if (!browserSupportsKeys() || !info.keys_supported) {
			disableKeyButton(keysUnavailableHint);
			return;
		}

		$("key-button").addEventListener("click", async () => {
			const button = $("key-button");
			showStatus("");
			button.disabled = true;
			try {
				const { ceremony, options } = await api("enroll/options", { token });
				const credential = await navigator.credentials.create({ publicKey: toCreationOptions(options) });
				await api("enroll/verify", { ceremony, response: registrationToJSON(credential) });
				// The link only works once, so don't leave it in the address bar or history
				window.history.replaceState(null, "", window.location.pathname);
				$("key-section").hidden = true;
				$("title").textContent = "Security key registered";
				$("subtitle").textContent =
					`"${info.key_name}" can now be used to sign in on ${info.domain}. You're signed in on this site.`;
				$("done-section").hidden = false;
			} catch (err) {
				showStatus(describeError(err));
				button.disabled = false;
			}
		});
	};

	const start = () => {
		if (document.body.dataset.page === "enroll") {
			initEnroll();
		} else {
			initLogin();
		}
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", start);
	} else {
		start();
	}
})();
