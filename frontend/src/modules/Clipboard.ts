/**
 * Copies text to the clipboard. The async Clipboard API only exists in secure
 * contexts (https or localhost), but the admin UI is often opened over plain http
 * on port 81, so fall back to a hidden textarea and execCommand("copy").
 */
export const copyText = async (text: string): Promise<boolean> => {
	try {
		if (window.isSecureContext && navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// fall through to the legacy way
	}
	const area = document.createElement("textarea");
	area.value = text;
	area.setAttribute("readonly", "");
	area.style.position = "fixed";
	area.style.opacity = "0";
	document.body.appendChild(area);
	const active = document.activeElement as HTMLElement | null;
	area.select();
	let ok = false;
	try {
		ok = document.execCommand("copy");
	} catch {
		ok = false;
	}
	document.body.removeChild(area);
	active?.focus?.();
	return ok;
};
