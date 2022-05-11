import { Button, ButtonProps } from "@chakra-ui/react";

function PrettyButton(props: ButtonProps) {
	return (
		<Button
			type="submit"
			fontFamily="heading"
			bgGradient="linear(to-r, red.400,pink.400)"
			color="white"
			_hover={{
				bgGradient: "linear(to-r, red.400,pink.400)",
				boxShadow: "xl",
			}}
			{...props}>
			{props.children}
		</Button>
	);
}

export { PrettyButton };
