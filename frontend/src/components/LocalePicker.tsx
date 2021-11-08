import React from "react";

import {
	Button,
	Box,
	Menu,
	MenuButton,
	MenuList,
	MenuItem,
} from "@chakra-ui/react";
import { Flag } from "components";
import { useLocaleState } from "context";
import { changeLocale, getFlagCodeForLocale, intl } from "locale";

export interface LocalPickerProps {
	/**
	 * On change handler
	 */
	onChange?: any;
	/**
	 * Class
	 */
	className?: string;
}

export const LocalePicker: React.FC<LocalPickerProps> = ({
	onChange,
	className,
}) => {
	const { locale, setLocale } = useLocaleState();

	const options = [
		["us", "en-US"],
		["de", "de-DE"],
		["fa", "fa-IR"],
	];

	const changeTo = (lang: string) => {
		changeLocale(lang);
		setLocale(lang);
		onChange && onChange(locale);
	};

	return (
		<Box className={className}>
			<Menu>
				<MenuButton as={Button}>
					<Flag country={getFlagCodeForLocale(locale)} />
				</MenuButton>
				<MenuList>
					{options.map((item) => {
						return (
							<MenuItem
								icon={<Flag country={item[0]} />}
								onClick={() => changeTo(item[0])}
								rel={item[1]}
								key={`locale-${item[0]}`}>
								<span>
									{intl.formatMessage({
										id: `locale-${item[1]}`,
										defaultMessage: item[1],
									})}
								</span>
							</MenuItem>
						);
					})}
				</MenuList>
			</Menu>
		</Box>
	);
};
