import crypto from "node:crypto";
import errs from "../../error.js";
import { toCertbotIni } from "../format.js";

/**
 * AWS Secrets Manager via OIDC web identity + STS + GetSecretValue (REST, no SDK).
 * meta: { region, role_arn }
 * secretRef.path: secret id or ARN
 */
export const assumeRoleWithWebIdentity = async ({ region, roleArn, webIdentityToken }) => {
	const params = new URLSearchParams({
		Action: "AssumeRoleWithWebIdentity",
		Version: "2011-06-15",
		RoleArn: roleArn,
		RoleSessionName: "npm-credential-resolver",
		WebIdentityToken: webIdentityToken,
		DurationSeconds: "900",
	});

	const response = await fetch(`https://sts.${region}.amazonaws.com/`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: params.toString(),
		signal: AbortSignal.timeout(15000),
	});

	const text = await response.text();
	if (!response.ok) {
		throw new errs.ValidationError(`AWS STS failed (${response.status})`);
	}

	const key = (name) => {
		const match = text.match(new RegExp(`<${name}>([^<]+)</${name}>`));
		return match?.[1];
	};

	return {
		accessKeyId: key("AccessKeyId"),
		secretAccessKey: key("SecretAccessKey"),
		sessionToken: key("SessionToken"),
	};
};

const sha256 = async (message) => {
	const data = new TextEncoder().encode(message);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Buffer.from(hash).toString("hex");
};

const hmac = async (key, message) => {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		typeof key === "string" ? new TextEncoder().encode(key) : key,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
	return Buffer.from(sig);
};

const getSignatureKey = async (key, dateStamp, regionName, serviceName) => {
	const kDate = await hmac(`AWS4${key}`, dateStamp);
	const kRegion = await hmac(kDate, regionName);
	const kService = await hmac(kRegion, serviceName);
	return hmac(kService, "aws4_request");
};

const signRequest = async ({ method, url, headers, body, credentials, region, service }) => {
	const urlObj = new URL(url);
	const amzDate = headers["x-amz-date"];
	const dateStamp = amzDate.slice(0, 8);
	const canonicalHeaders = `${Object.keys(headers)
		.sort()
		.map((k) => `${k.toLowerCase()}:${headers[k].trim()}\n`)
		.join("")}host:${urlObj.host}\n`;
	const signedHeaders = `${Object.keys(headers)
		.sort()
		.map((k) => k.toLowerCase())
		.join(";")};host`;
	const payloadHash = await sha256(body || "");
	const canonicalRequest = [method, urlObj.pathname + urlObj.search, "", canonicalHeaders, signedHeaders, payloadHash].join(
		"\n",
	);
	const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
	const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256(canonicalRequest)].join("\n");
	const signingKey = await getSignatureKey(credentials.secretAccessKey, dateStamp, region, service);
	const signature = (await hmac(signingKey, stringToSign)).toString("hex");

	return `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
};

export const resolveAws = async (provider, secretRef, oidcToken) => {
	const { region = "us-east-1", role_arn } = provider.meta || {};
	if (!role_arn) {
		throw new errs.ValidationError("AWS provider requires role_arn in meta");
	}

	const credentials = await assumeRoleWithWebIdentity({
		region,
		roleArn: role_arn,
		webIdentityToken: oidcToken,
	});

	const secretId = secretRef.path?.replace(/^\//, "");
	const host = `secretsmanager.${region}.amazonaws.com`;
	const url = `https://${host}/`;
	const body = JSON.stringify({ SecretId: secretId });
	const now = new Date();
	const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
	const headers = {
		"Content-Type": "application/x-amz-json-1.1",
		"X-Amz-Target": "secretsmanager.GetSecretValue",
		"X-Amz-Date": amzDate,
		"X-Amz-Security-Token": credentials.sessionToken,
		Host: host,
	};

	headers.Authorization = await signRequest({
		method: "POST",
		url,
		headers,
		body,
		credentials,
		region,
		service: "secretsmanager",
	});

	const response = await fetch(url, {
		method: "POST",
		headers,
		body,
		signal: AbortSignal.timeout(15000),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new errs.ValidationError(`AWS Secrets Manager failed (${response.status}): ${text.slice(0, 200)}`);
	}

	const data = await response.json();
	let payload = data.SecretString;
	if (!payload && data.SecretBinary) {
		payload = Buffer.from(data.SecretBinary, "base64").toString("utf8");
	}
	try {
		payload = JSON.parse(payload);
	} catch {
		// keep string
	}
	return toCertbotIni(payload, secretRef.field);
};
