import { type FormikErrors, setNestedObjectValues } from "formik";
import { useCallback, useEffect, useRef, useState } from "react";
import { type HostTestEndpoint, type HostTestResult, testHostConfig } from "src/api/backend";

interface TestableForm {
	values: any;
	validateForm: () => Promise<FormikErrors<any>>;
	setTouched: (touched: any, shouldValidate?: boolean) => unknown;
}

interface HostConfigTestState {
	result: HostTestResult | null;
	// the request itself failed: invalid payload (400), rate limit, ...
	error: unknown;
	// JSON of the form values that were tested, to tell when the result is stale
	testedKey: string | null;
}

const EMPTY: HostConfigTestState = { result: null, error: null, testedKey: null };

/** Key of a form state, to compare the tested values with the current ones */
export const formValuesKey = (values: unknown) => JSON.stringify(values ?? null);

/**
 * "Test config" in a host modal: validates the form like a submit would, then
 * asks the backend to check the payload without saving it.
 *
 * One test at a time: a new test aborts a running one. Nothing is cached and
 * no query is invalidated, a test never changes anything.
 */
const useHostConfigTest = (endpoint: HostTestEndpoint) => {
	const [state, setState] = useState<HostConfigTestState>(EMPTY);
	const [isTesting, setIsTesting] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => () => abortRef.current?.abort(), []);

	const reset = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setIsTesting(false);
		setState(EMPTY);
	}, []);

	/**
	 * @param form     the Formik bag (values, validateForm, setTouched)
	 * @param payload  what a save would send
	 * @param onInvalid  called with the field errors when the form doesn't validate
	 * @returns the result, or null when the form was invalid or the request failed
	 */
	const runTest = useCallback(
		async (
			form: TestableForm,
			payload: Record<string, any>,
			onInvalid?: (errors: FormikErrors<any>) => void,
		): Promise<HostTestResult | null> => {
			const errors = await form.validateForm();
			if (Object.keys(errors).length) {
				form.setTouched(setNestedObjectValues(errors, true), false);
				onInvalid?.(errors);
				return null;
			}

			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;
			const testedKey = formValuesKey(form.values);
			setIsTesting(true);
			setState(EMPTY);
			try {
				const result = await testHostConfig(endpoint, payload, controller);
				if (controller.signal.aborted) return null;
				setState({ result, error: null, testedKey });
				return result;
			} catch (error) {
				if (controller.signal.aborted) return null;
				setState({ result: null, error, testedKey });
				return null;
			} finally {
				if (abortRef.current === controller) {
					abortRef.current = null;
					setIsTesting(false);
				}
			}
		},
		[endpoint],
	);

	return { ...state, isTesting, runTest, reset };
};

export { useHostConfigTest };
