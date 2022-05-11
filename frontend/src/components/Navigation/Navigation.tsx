import { useDisclosure } from "@chakra-ui/react";
import { NavigationHeader, NavigationMenu } from "components";

function Navigation() {
	const {
		isOpen: mobileNavIsOpen,
		onToggle: mobileNavToggle,
		onClose: mobileNavClose,
	} = useDisclosure();
	return (
		<>
			<NavigationHeader
				toggleMobileNav={mobileNavToggle}
				mobileNavIsOpen={mobileNavIsOpen}
			/>
			<NavigationMenu
				mobileNavIsOpen={mobileNavIsOpen}
				closeMobileNav={mobileNavClose}
			/>
		</>
	);
}

export { Navigation };
