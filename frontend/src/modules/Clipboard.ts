/**
 * Copies text to the clipboard.
 *
 * The admin interface is often opened over plain http, where the Clipboard API isn't
 * available, so this falls back to a temporary textarea. It's added inside an open modal,
 * if any, because the modal keeps focus from leaving it.
 *
 * @param   {string}  text
 * @returns {Promise<boolean>}  Whether the text was copied
 */
export async function copyText(text: string): Promise<boolean> {
	if (navigator.clipboard && window.isSecureContext) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// fall through to the fallback
		}
	}

	const container = document.activeElement?.closest(".modal") || document.body;
	const el = document.createElement("textarea");
	el.value = text;
	el.setAttribute("readonly", "");
	el.style.position = "fixed";
	el.style.top = "0";
	el.style.opacity = "0";
	container.appendChild(el);
	el.select();

	let copied = false;
	try {
		copied = document.execCommand("copy");
	} catch {
		copied = false;
	}
	container.removeChild(el);
	return copied;
}
