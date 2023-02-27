import { Button, MenuButton, MenuButtonProps } from "@chakra-ui/react";
import { FiChevronDown } from "react-icons/fi";

function PrettyMenuButton(props: MenuButtonProps) {
	return (
		<MenuButton
			size="sm"
			as={Button}
			fontFamily="heading"
			bgGradient="linear(to-r, red.400,pink.400)"
			color="white"
			rightIcon={<FiChevronDown />}
			_hover={{
				bgGradient: "linear(to-r, red.400,pink.400)",
				boxShadow: "xl",
			}}
			{...props}>
			{props.children}
		</MenuButton>
	);
}

export { PrettyMenuButton };
