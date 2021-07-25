export interface Sort {
	field: string;
	direction: "ASC" | "DESC";
}

export interface Setting {
	id: number;
	createdOn: number;
	modifiedOn: number;
	name: string;
	value: any;
}
