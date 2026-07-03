import { useQuery } from "@tanstack/react-query";
import { type Certificate, getCertificate } from "src/api/backend";

const fetchCertificate = (id: number | "new") => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			provider: "",
			niceName: "",
			domainNames: [],
			expiresOn: "",
			meta: {},
		} as Certificate);
	}
	return getCertificate(id, ["owner"]);
};

const useCertificate = (id: number | "new", options = {}) => {
	return useQuery<Certificate, Error>({
		queryKey: ["certificate", id],
		queryFn: () => fetchCertificate(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

export { useCertificate };
