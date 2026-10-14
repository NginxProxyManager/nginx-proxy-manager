import { useQuery } from "@tanstack/react-query";
import { getLoginOptions, type LoginOptions } from "src/api/backend";

/**
 * The sign in methods available on the login screen. Fetched without a token,
 * so it is also used to decide whether the password form is shown at all.
 */
const useLoginOptions = (options = {}) => {
	return useQuery<LoginOptions, Error>({
		queryKey: ["login-options"],
		queryFn: getLoginOptions,
		staleTime: 60 * 1000,
		retry: false,
		...options,
	});
};

export { useLoginOptions };
