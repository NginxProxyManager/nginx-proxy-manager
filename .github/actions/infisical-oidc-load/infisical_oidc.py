#!/usr/bin/env python3
"""Fetch Infisical secrets via GitHub OIDC and export to GITHUB_ENV."""

from __future__ import annotations

import base64
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

# Infisical secret key -> GitHub Actions env name (must match [A-Z_][A-Z0-9_]*)
ENV_ALIASES: dict[str, str] = {
    "ansible-ssh-private-key": "ANSIBLE_SSH_PRIVATE_KEY",
    "ansible-ssh-public-key": "ANSIBLE_SSH_PUBLIC_KEY",
    "ssh-user-ca-public-key": "SSH_USER_CA_PUBLIC_KEY",
    "ssh-user-ca-private-key": "SSH_USER_CA_PRIVATE_KEY",
    "haproxy_stats_password": "HAPROXY_STATS_PASSWORD",
    "haproxy_stats_user": "HAPROXY_STATS_USER",
    "ansible_inventory": "ANSIBLE_INVENTORY",
    "github-app-id": "AUTOMATION_GITHUB_APP_ID",
    "github-app-private-key": "AUTOMATION_GITHUB_APP_PRIVATE_KEY",
    "automation-github-app-id": "AUTOMATION_GITHUB_APP_ID",
    "automation-github-app-private-key": "AUTOMATION_GITHUB_APP_PRIVATE_KEY",
    "github-runners-app-id": "GITHUB_RUNNERS_APP_ID",
    "github-runners-app-private-key": "GITHUB_RUNNERS_APP_PRIVATE_KEY",
    "github-runners-app-installation-id-infra": "GITHUB_RUNNERS_APP_INSTALLATION_ID_INFRA",
    "github-runners-app-installation-id-gen": "GITHUB_RUNNERS_APP_INSTALLATION_ID_GEN",
    "docker.io-user": "DOCKER_IO_USER",
    "docker.io-token": "DOCKER_IO_TOKEN",
}

# Keys stripped or redacted before any log/error output
_SENSITIVE_JSON_KEYS = frozenset(
    {
        "accessToken",
        "access_token",
        "secretValue",
        "secret_value",
        "token",
        "password",
        "privateKey",
        "private_key",
        "value",
    }
)


def parse_secret_keys(raw: str) -> frozenset[str] | None:
    text = raw.strip()
    if not text:
        return None
    keys = {k.strip() for k in re.split(r"[\s,]+", text) if k.strip()}
    return frozenset(keys) if keys else None


def env_name_for_secret(key: str) -> str:
    if key in ENV_ALIASES:
        return ENV_ALIASES[key]
    normalized = re.sub(r"[^a-zA-Z0-9_]", "_", key).upper()
    if normalized and normalized[0].isdigit():
        normalized = f"INFISICAL_{normalized}"
    return normalized


def _redact_for_log(obj: object) -> object:
    if isinstance(obj, dict):
        return {
            k: "***" if k in _SENSITIVE_JSON_KEYS else _redact_for_log(v)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_redact_for_log(item) for item in obj]
    return obj


def _safe_json_for_log(obj: object) -> str:
    return json.dumps(_redact_for_log(obj))


def _safe_error_body(body: str, *, max_len: int = 500) -> str:
    text = body.strip()
    if not text:
        return "(empty)"
    try:
        return _safe_json_for_log(json.loads(text))
    except json.JSONDecodeError:
        if len(text) > max_len:
            return text[:max_len] + "…"
        return text


def _oidc_claims_summary(jwt: str) -> str:
    b64 = jwt.split(".")[1]
    b64 += "=" * (-len(b64) % 4)
    payload = json.loads(base64.urlsafe_b64decode(b64))
    sub = payload.get("sub", "")
    aud = payload.get("aud", "")
    return f"sub={sub!r} aud={aud!r}"


def register_masks(value: str) -> None:
    """Register GitHub log masks (stdout workflow commands; not user-facing logs)."""
    if not value:
        return
    lines = value.splitlines() if "\n" in value or "\r" in value else [value]
    for line in lines:
        if line:
            sys.stdout.write(f"::add-mask::{line}\n")
    sys.stdout.flush()


def log_error(message: str) -> None:
    print(f"::error::{message}", file=sys.stderr)


def append_github_env(name: str, value: str) -> None:
    path = os.environ.get("GITHUB_ENV")
    if not path:
        return
    register_masks(value)
    with open(path, "a", encoding="utf-8") as fh:
        if "\n" in value or "\r" in value:
            fh.write(f"{name}<<EOF\n{value.rstrip(chr(10))}\nEOF\n")
        else:
            escaped = value.replace("%", "%25").replace("\r", "").replace("\n", "%0A")
            fh.write(f"{name}={escaped}\n")


def main() -> int:
    domain = os.environ["INFISICAL_DOMAIN"].rstrip("/")
    identity_id = os.environ["IDENTITY_ID"]
    env_slug = os.environ["ENV_SLUG"]
    project_slug = os.environ["PROJECT_SLUG"]
    project_id = os.environ.get("PROJECT_ID", "").strip()
    secret_path = os.environ["SECRET_PATH"]
    recursive = os.environ.get("RECURSIVE", "true").lower() in ("1", "true", "yes")
    secret_keys = parse_secret_keys(os.environ.get("SECRET_KEYS", ""))
    jwt_path = os.environ["JWT_FILE"]

    jwt = Path(jwt_path).read_text(encoding="utf-8").strip()

    login_body = urllib.parse.urlencode({"identityId": identity_id, "jwt": jwt}).encode()
    login_req = urllib.request.Request(
        f"{domain}/api/v1/auth/oidc-auth/login",
        data=login_body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(login_req) as resp:
            login_json = json.load(resp)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        log_error(
            f"Infisical OIDC login failed ({exc.code}): {_safe_error_body(body)} "
            f"({_oidc_claims_summary(jwt)})"
        )
        if "claim not allowed" in body.lower():
            log_error("Clear Infisical Claims and claim metadata mapping.")
        elif "subject not allowed" in body.lower():
            log_error("Set Infisical Subject to sub above, or repo:*-alexson/* on v0.160.4+.")
        elif "audience not allowed" in body.lower():
            log_error("Set Infisical Audiences to aud above, or https://github.com/*-alexson.")
        return 1

    token = login_json.get("accessToken")
    if not token:
        log_error(
            f"No accessToken in OIDC login response (keys: {', '.join(sorted(login_json.keys()))})"
        )
        return 1
    register_masks(token)

    if not project_id:
        slug_req = urllib.request.Request(
            f"{domain}/api/v1/projects/slug/{urllib.parse.quote(project_slug, safe='')}",
            headers={"Authorization": f"Bearer {token}"},
        )
        try:
            with urllib.request.urlopen(slug_req) as resp:
                project_json = json.load(resp)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode(errors="replace")
            log_error(f"Project '{project_slug}' lookup failed ({exc.code}): {_safe_error_body(body)}")
            if "ProjectMembershipNotFound" in body or "not a member of this project" in body:
                log_error(
                    "Add the machine identity under Project → Access Control → Machine Identities."
                )
            return 1
        project_id = project_json.get("id") or project_json.get("_id") or ""
        if not project_id:
            log_error(
                f"Project lookup returned no id (keys: {', '.join(sorted(project_json.keys()))})"
            )
            return 1

    params = urllib.parse.urlencode(
        {
            "secretPath": secret_path,
            "environment": env_slug,
            "projectId": project_id,
            "includeImports": "true",
            "recursive": "true" if recursive else "false",
            "expandSecretReferences": "true",
            "viewSecretValue": "true",
        }
    )
    secrets_req = urllib.request.Request(
        f"{domain}/api/v4/secrets/?{params}",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(secrets_req) as resp:
            secrets_json = json.load(resp)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        log_error(f"Infisical secrets export failed ({exc.code}): {_safe_error_body(body)}")
        return 1

    values: dict[str, str] = {s["secretKey"]: s["secretValue"] for s in secrets_json.get("secrets", [])}
    for imp in reversed(secrets_json.get("imports") or []):
        for s in imp.get("secrets") or []:
            values.setdefault(s["secretKey"], s["secretValue"])

    if secret_keys is not None:
        values = {k: v for k, v in values.items() if k in secret_keys}
        if not values:
            log_error(
                f"No secrets matched secret_keys={', '.join(sorted(secret_keys))} "
                f"environment={env_slug} secretPath={secret_path} recursive={recursive}."
            )
            return 1
    elif not values:
        log_error(
            f"No secrets at environment={env_slug} secretPath={secret_path} recursive={recursive}."
        )
        return 1

    for key, value in values.items():
        append_github_env(env_name_for_secret(key), value)

    return 0


if __name__ == "__main__":
    sys.exit(main())
