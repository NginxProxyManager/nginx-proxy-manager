import type { Table as ReactTable } from "@tanstack/react-table";
import cn from "classnames";
import type { ReactNode } from "react";
import { Button, HasPermission } from "src/components";
import { T } from "src/locale";
import { type ADMIN, MANAGE, type Permission, type Section } from "src/modules/Permissions";

interface Props {
	tableInstance: ReactTable<any>;
	onNew?: () => void;
	isFiltered?: boolean;
	object: string;
	objects: string;
	color?: string;
	customAddBtn?: ReactNode;
	permissionSection?: Section | typeof ADMIN;
	permission?: Permission;
}
function EmptyData({
	tableInstance,
	onNew,
	isFiltered,
	object,
	objects,
	color = "primary",
	customAddBtn,
	permissionSection,
	permission,
}: Props) {
	return (
		<tr>
			<td colSpan={tableInstance.getVisibleFlatColumns().length}>
				<div className="text-center my-4">
					{isFiltered ? (
						<h2>
							<T id="empty-search" />
						</h2>
					) : (
						<>
							<h2>
								<T id="object.empty" tData={{ objects }} />
							</h2>
							<HasPermission section={permissionSection} permission={permission || MANAGE} hideError>
								<p className="text-muted">
									<T id="empty-subtitle" />
								</p>
								{customAddBtn ? (
									customAddBtn
								) : (
									<Button className={cn("my-3", `btn-${color}`)} onClick={onNew}>
										<T id="object.add" tData={{ object }} />
									</Button>
								)}
							</HasPermission>
						</>
					)}
				</div>
			</td>
		</tr>
	);
}

export { EmptyData };
