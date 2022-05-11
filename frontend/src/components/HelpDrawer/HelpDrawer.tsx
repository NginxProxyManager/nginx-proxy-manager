import { useEffect, useState } from "react";

import {
	Button,
	Drawer,
	DrawerContent,
	DrawerOverlay,
	DrawerBody,
	useDisclosure,
} from "@chakra-ui/react";
import { getLocale } from "locale";
import { FiHelpCircle } from "react-icons/fi";
import ReactMarkdown from "react-markdown";

import { getHelpFile } from "../../locale/src/HelpDoc";

interface HelpDrawerProps {
	/**
	 * Section to show
	 */
	section: string;
}
function HelpDrawer({ section }: HelpDrawerProps) {
	const { isOpen, onOpen, onClose } = useDisclosure();
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
		<>
			<Button size="sm" onClick={onOpen}>
				<FiHelpCircle />
			</Button>
			<Drawer onClose={onClose} isOpen={isOpen} size="xl">
				<DrawerOverlay />
				<DrawerContent>
					<DrawerBody className="helpdoc-body">
						<ReactMarkdown>{markdownText}</ReactMarkdown>
					</DrawerBody>
				</DrawerContent>
			</Drawer>
		</>
	);
}

export { HelpDrawer };
