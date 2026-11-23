import { useFormikContext } from "formik";
import { useUpstreamCheck } from "src/hooks";
import { isVariableHost } from "src/modules/HostStatus";
import { UpstreamCheckHint, VariableHostHint } from "../StatusBadges";

/**
 * Live reachability of a proxy host's main forward host (Details tab).
 *
 * The backend writes the main forward host as `set $server "<host>";`, so a
 * single nginx variable works there too and is resolved per request: it gets
 * the neutral variable hint and no live check (useUpstreamCheck skips it).
 * Unlike a location's forward host it is never split at "/", so `$backend/api`
 * is not a variable host here.
 */
export function ForwardHostCheckHint({ id = "forwardHost-check" }: { id?: string }) {
	const { values } = useFormikContext<any>();
	const { result, isChecking } = useUpstreamCheck({
		host: values.forwardHost,
		port: values.forwardPort,
		scheme: values.forwardScheme,
	});
	if (isVariableHost(values.forwardHost)) {
		return <VariableHostHint id={id} tipId="upstream.check.variable-tip-main" />;
	}
	return <UpstreamCheckHint id={id} result={result} isChecking={isChecking} />;
}
