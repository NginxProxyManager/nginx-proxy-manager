import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useEffect, useState } from "react";
import Modal from "react-bootstrap/Modal";
import ReactMarkdown from "react-markdown";
import { getLocale, T } from "src/locale";
import { getHelpFile } from "src/locale/src/HelpDoc";

interface Props extends InnerModalProps {
	section: string;
}

const showHelpModal = (section: string) => {
	EasyModal.show(HelpModal, { section });
};

const HelpModal = EasyModal.create(({ section, visible, remove }: Props) => {
	const [markdownText, setMarkdownText] = useState("");
	const lang = getLocale(true);

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
			<Modal.Header closeButton>
				<Modal.Title>
					<T id="help" />
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<ReactMarkdown>{markdownText}</ReactMarkdown>
			</Modal.Body>
		</Modal>
	);
});

export { showHelpModal };
