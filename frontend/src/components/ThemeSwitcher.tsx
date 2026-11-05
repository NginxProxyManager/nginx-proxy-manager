import { IconMoon, IconSun } from "@tabler/icons-react";
import cn from "classnames";
import { useId } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { Button } from "src/components";
import { useTheme } from "src/hooks";
import styles from "./ThemeSwitcher.module.css";

interface Props {
	className?: string;
}
function ThemeSwitcher({ className }: Props) {
	const { setTheme } = useTheme();
	const tooltipId = useId();

	return (
		<div className={cn("d-print-none", "d-inline-block", className)}>
			<OverlayTrigger placement="bottom" overlay={<Tooltip id={`${tooltipId}-dark`}>Enable dark mode</Tooltip>}>
				<Button
					size="sm"
					className={cn("btn-ghost-dark", "hide-theme-dark", styles.lightBtn)}
					aria-label="Enable dark mode"
					onClick={() => setTheme("dark")}
				>
					<IconMoon width={24} />
				</Button>
			</OverlayTrigger>
			<OverlayTrigger placement="bottom" overlay={<Tooltip id={`${tooltipId}-light`}>Enable light mode</Tooltip>}>
				<Button
					size="sm"
					className={cn("btn-ghost-light", "hide-theme-light", styles.darkBtn)}
					aria-label="Enable light mode"
					onClick={() => setTheme("light")}
				>
					<IconSun width={24} />
				</Button>
			</OverlayTrigger>
		</div>
	);
}

export { ThemeSwitcher };
