import { Box } from "@chakra-ui/layout";
import { hasFlag } from "country-flag-icons";
// @ts-ignore Creating a typing for a subfolder is not easily possible
import Flags from "country-flag-icons/react/3x2";

interface FlagProps {
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * Two letter country code of flag
	 */
	countryCode: string;
}
function Flag({ className, countryCode }: FlagProps) {
	countryCode = countryCode.toUpperCase();

	if (hasFlag(countryCode)) {
		// @ts-ignore have to do this because of above
		const FlagElement = Flags[countryCode] as any;
		return (
			<Box as={FlagElement} title={countryCode} className={className} w={6} />
		);
	} else {
		console.error(`No flag for country ${countryCode} found!`);

		return <Box w={6} h={4} />;
	}
}

export { Flag };
