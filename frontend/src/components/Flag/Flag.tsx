import React from "react";

import { Box } from "@chakra-ui/layout";
import { hasFlag } from "country-flag-icons";
// @ts-ignore Creating a typing for a subfolder is not easily possible
import Flags from "country-flag-icons/react/3x2";

export interface FlagProps {
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * Two letter country code of flag
	 */
	countryCode: string;
}
export const Flag: React.FC<FlagProps> = ({ className, countryCode }) => {
	countryCode = countryCode.toUpperCase();

	if (hasFlag(countryCode)) {
		const FlagElement = Flags[countryCode];
		return (
			<Box as={FlagElement} title={countryCode} className={className} w={6} />
		);
	} else {
		console.error(`No flag for country ${countryCode} found!`);

		return <Box w={6} h={4} />;
	}
};
