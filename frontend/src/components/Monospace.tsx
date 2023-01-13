import { Text, TextProps } from "@chakra-ui/react";

function Monospace(props: TextProps) {
	return (
		<Text as="span" className="monospace" {...props}>
			{props.children}
		</Text>
	);
}

export { Monospace };
