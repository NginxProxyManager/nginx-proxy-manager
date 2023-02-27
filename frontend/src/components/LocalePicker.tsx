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
import {
	changeLocale,
	getFlagCodeForLocale,
	intl,
	localeOptions,
} from "locale";

interface LocalPickerProps {
	/**
	 * On change handler
	 */
	onChange?: any;
	/**
	 * Class
	 */
	className?: string;
}

function LocalePicker({ onChange, className }: LocalPickerProps) {
	const { locale, setLocale } = useLocaleState();

	const changeTo = (lang: string) => {
		changeLocale(lang);
		setLocale(lang);
		onChange && onChange(locale);
	};

	return (
		<Box className={className}>
			<Menu>
				<MenuButton as={Button}>
					<Flag countryCode={getFlagCodeForLocale(locale)} />
				</MenuButton>
				<MenuList>
					{localeOptions.map((item) => {
						return (
							<MenuItem
								icon={<Flag countryCode={getFlagCodeForLocale(item[0])} />}
								onClick={() => changeTo(item[0])}
								key={`locale-${item[0]}`}>
								<span>{intl.formatMessage({ id: `locale-${item[1]}` })}</span>
							</MenuItem>
						);
					})}
				</MenuList>
			</Menu>
		</Box>
	);
}

export { LocalePicker };
