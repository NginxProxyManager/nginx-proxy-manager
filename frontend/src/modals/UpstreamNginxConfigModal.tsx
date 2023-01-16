import {
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalCloseButton,
	ModalBody,
} from "@chakra-ui/react";
import { useUpstreamNginxConfig } from "hooks";
import { intl } from "locale";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import sh from "react-syntax-highlighter/dist/esm/languages/hljs/bash";
import nord from "react-syntax-highlighter/dist/esm/styles/hljs/nord";

interface UpstreamNginxConfigModalProps {
	upstreamId: number;
	isOpen: boolean;
	onClose: () => void;
}
function UpstreamNginxConfigModal({
	isOpen,
	onClose,
	upstreamId,
}: UpstreamNginxConfigModalProps) {
	const { isLoading, data } = useUpstreamNginxConfig(upstreamId);
	SyntaxHighlighter.registerLanguage("bash", sh);

	return (
		<Modal isOpen={isOpen} onClose={onClose} closeOnOverlayClick={false}>
			<ModalOverlay />
			<ModalContent maxW="34rem">
				{isLoading ? (
					"loading"
				) : (
					<>
						<ModalHeader>
							{intl.formatMessage({ id: "nginx-config" })}
						</ModalHeader>
						<ModalCloseButton />
						<ModalBody>
							<SyntaxHighlighter
								language="bash"
								style={nord}
								customStyle={{
									maxWidth: "31rem",
									fontSize: "80%",
									borderWidth: "1px",
									borderColor: "#3C4960",
									borderRadius: "5px",
									marginBottom: "16px",
								}}>
								{data || ""}
							</SyntaxHighlighter>
						</ModalBody>
					</>
				)}
			</ModalContent>
		</Modal>
	);
}

export { UpstreamNginxConfigModal };
