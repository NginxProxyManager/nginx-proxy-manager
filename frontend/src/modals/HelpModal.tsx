import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useEffect, useState } from "react";
import Modal from "react-bootstrap/Modal";
import ReactMarkdown from "react-markdown";
import { Button, CopyableCode } from "src/components";
import { getLocale, T } from "src/locale";
import { getHelpFile } from "src/locale/src/HelpDoc";

interface Props extends InnerModalProps {
	section: string;
	color?: string;
}

const showHelpModal = (section: string, color?: string) => {
	EasyModal.show(HelpModal, { section, color });
};

const HelpModal = EasyModal.create(({ section, color, visible, remove }: Props) => {
	const [markdownText, setMarkdownText] = useState("");
	const lang = getLocale();

	useEffect(() => {
		try {
			const docFile = getHelpFile(lang, section) as any;
			fetch(docFile)
				.then((response) => response.text())
				.then(setMarkdownText);
		} catch (ex: any) {
			setMarkdownText(`**ERROR:** ${ex.message}`);
		}
	}, [lang, section]);

	return (
		<Modal show={visible} onHide={remove}>
			<Modal.Body>
				<ReactMarkdown
					components={{
						pre: ({ children }) => <CopyableCode>{children}</CopyableCode>,
						// links lead to the online docs: keep the app open
						a: ({ href, children }) => (
							<a href={href} target="_blank" rel="noopener noreferrer">
								{children}
							</a>
						),
					}}
				>
					{markdownText}
				</ReactMarkdown>
			</Modal.Body>
			<Modal.Footer>
				<Button
					type="button"
					actionType="primary"
					className={cn("ms-auto", color ? `btn-${color}` : null)}
					data-bs-dismiss="modal"
					onClick={remove}
				>
					<T id="action.close" />
				</Button>
			</Modal.Footer>
		</Modal>
	);
});

export { showHelpModal };
