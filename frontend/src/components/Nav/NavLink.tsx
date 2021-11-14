import React, { ReactNode } from "react";

import { Link, useColorModeValue } from "@chakra-ui/react";

export interface NavLinkProps {
	/**
	 * Child elements within
	 */
	children?: ReactNode;
}
export const NavLink: React.FC<NavLinkProps> = ({ children }) => {
	return (
		<Link
			px={2}
			py={1}
			rounded={"md"}
			_hover={{
				textDecoration: "none",
				bg: useColorModeValue("gray.200", "gray.700"),
			}}
			href={"#"}>
			{children}
		</Link>
	);
};
