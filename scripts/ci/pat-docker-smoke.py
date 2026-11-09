#!/usr/bin/env python3
"""Exercise the built Docker image through its real Nginx and HTTP API.

Requires a fresh app on 127.0.0.1:18081 (admin) / :18080 (proxy) and a
Docker-network service named upstream:80 serving pat-docker-smoke-upstream.
The caller must name the app container npm-pat-test and own container/volume
teardown, including on failure. This test
uses only ephemeral credentials, HTTP fixture hosts and no ACME operations.
Never print request/response bodies, credentials, or unfiltered exceptions.
"""

import hashlib
import http.client
import json
import re
import secrets
import subprocess
import tempfile
from pathlib import Path
import sys
import time
from html.parser import HTMLParser

ADMIN_PORT = 18081
PROXY_PORT = 18080
STARTUP_SECONDS = 120
RELOAD_SECONDS = 30
REQUEST_SECONDS = 15
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
UPSTREAM_BODY = b"pat-docker-smoke-upstream\n"
HOST = "pat-smoke.test"
ALIAS = "pat-smoke-updated.test"
TOKEN_FIELDS = {
    "id", "name", "scopes", "visibility", "created_on", "expires_on",
    "revoked_on", "last_used_on", "status",
}
PRIVATE_FIELDS = {
    "token", "secret", "secret_hash", "password", "password_version",
    "dns_provider_credentials", "certificate_key", "totp_secret",
    "totp_pending_secret", "backup_codes", "debug",
}
KNOWN_SECRETS = []


class SmokeFailure(Exception):
    """A diagnostic constructed by this test, containing no server data."""


def require(condition, message):
    if not condition:
        raise SmokeFailure(message)


def progress(message):
    print(f"PASS: {message}", flush=True)


def request(method, path, *, token=None, body=None, port=ADMIN_PORT, host=None,
            timeout=REQUEST_SECONDS, content_type="application/json"):
    # Use a fixed loopback connection: no environment proxy, DNS or redirects
    # can forward generated credentials outside this disposable Docker stack.
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    headers = {"Accept": "application/json", "Connection": "close"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    if host is not None:
        headers["Host"] = host
    data = None
    if body is not None:
        headers["Content-Type"] = content_type
        data = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
    try:
        connection.request(method, path, body=data, headers=headers)
        response = connection.getresponse()
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        require(len(raw) <= MAX_RESPONSE_BYTES, "HTTP response exceeded safety limit")
        return response.status, response.getheader("Content-Type", ""), raw
    except (OSError, http.client.HTTPException):
        raise SmokeFailure(f"{method} {path}: loopback HTTP request failed") from None
    finally:
        connection.close()


def no_secrets(value, label, *, allow_token=False):
    """Check all nested keys and known secret values without exposing either."""
    if isinstance(value, dict):
        for key, item in value.items():
            require(key not in PRIVATE_FIELDS or (allow_token and key == "token"),
                    f"{label}: response exposed a private field")
            if not (allow_token and key == "token"):
                no_secrets(item, label)
    elif isinstance(value, list):
        for item in value:
            no_secrets(item, label)
    elif isinstance(value, str):
        require(not any(secret in value for secret in KNOWN_SECRETS),
                f"{label}: response exposed credential material")


def api(method, path, *, token=None, body=None, expected=200, allow_token=False, content_type="application/json"):
    status, content_type, raw = request(method, "/api" + path, token=token, body=body, content_type=content_type)
    label = f"{method} /api{path}"
    require(status == expected, f"{label}: expected HTTP {expected}, got {status}")
    require("application/json" in content_type.lower(), f"{label}: expected JSON")
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeError):
        raise SmokeFailure(f"{label}: invalid JSON response") from None
    no_secrets(value, label, allow_token=allow_token)
    return value


def wait_for(description, check, seconds):
    deadline = time.monotonic() + seconds
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise SmokeFailure(f"Timed out waiting for {description}")
        try:
            result = check(min(5, remaining))
            if result is not None:
                return result
        except SmokeFailure:
            # Startup/reload failures are transient; do not print response bodies.
            pass
        time.sleep(min(1, max(0, deadline - time.monotonic())))


def healthy(timeout):
    status, content_type, raw = request("GET", "/api/", timeout=timeout)
    if status != 200 or "application/json" not in content_type.lower():
        return None
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeError):
        return None
    return value if isinstance(value, dict) and value.get("status") == "OK" else None


class ModuleScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "script" and attributes.get("type") == "module":
            self.sources.append(attributes.get("src", ""))


def check_ui():
    status, content_type, raw = request("GET", "/")
    require(status == 200 and "text/html" in content_type.lower(),
            "Admin UI did not serve HTML")
    html = raw.decode("utf-8")
    require("Nginx Proxy Manager" in html and 'id="root"' in html,
            "Admin UI HTML is missing its application shell")
    scripts = ModuleScripts()
    scripts.feed(html)
    assets = [src for src in scripts.sources if re.fullmatch(r"/assets/[A-Za-z0-9_.-]+\.js", src)]
    require(bool(assets), "Admin UI is missing its compiled JavaScript entrypoint")
    for asset in assets:
        status, content_type, raw = request("GET", asset)
        require(status == 200 and "javascript" in content_type.lower() and len(raw) > 100,
                "Admin UI compiled JavaScript asset did not load")


def proxy_check(host, forwarded, timeout):
    status, _, raw = request("GET", "/", port=PROXY_PORT, host=host, timeout=timeout)
    if forwarded:
        return True if status == 200 and raw == UPSTREAM_BODY else None
    # A connection error / 502 is not evidence of successful config deletion.
    return True if status == 200 and raw != UPSTREAM_BODY else None


def wait_proxy(host, forwarded):
    state = "forwarding" if forwarded else "fallback after configuration removal"
    wait_for(f"{host} {state}", lambda timeout: proxy_check(host, forwarded, timeout), RELOAD_SECONDS)


def positive_id(record, label):
    require(isinstance(record, dict), f"{label}: expected an object")
    value = record.get("id")
    require(type(value) is int and value > 0, f"{label}: missing valid ID")
    return value


def token_metadata(jwt, token_id, *, revoked=False, used=False):
    records = api("GET", "/api-tokens", token=jwt)
    require(isinstance(records, list) and len(records) == 1,
            "Token list must contain exactly the single fixture token")
    row = records[0]
    require(isinstance(row, dict) and set(row) == TOKEN_FIELDS,
            "Token list exposed unexpected fields or omitted metadata")
    require(row["id"] == token_id and row["scopes"] == ["proxy_hosts:write"],
            "Token list did not preserve the requested identity and scope")
    require(bool(row["revoked_on"]) == revoked, "Token revocation metadata was incorrect")
    require(row["status"] == ("revoked" if revoked else "active"),
            "Token effective status did not match its lifecycle")
    if used:
        require(bool(row["last_used_on"]), "Token usage metadata was not recorded")



RESOURCES = ("proxy_hosts", "redirection_hosts", "dead_hosts", "streams", "access_lists", "certificates")
HOST_RESOURCES = RESOURCES[:4]


def login_fixture(user):
    result = api("POST", "/tokens", body={"identity": user["email"], "secret": user["password"]}, allow_token=True)
    user["jwt"] = result["token"]
    KNOWN_SECRETS.append(user["jwt"])


def mint_fixture(user, scopes):
    result = api("POST", "/api-tokens", token=user["jwt"], expected=201, allow_token=True,
                 body={"name": "Disposable matrix", "scopes": scopes,
                       "expires_in_days": 1, "password": user["password"]})
    require(result.get("status") == "active", "New fixture token must be active")
    pat = result["token"]
    secret = pat.split(".", 1)[1]
    KNOWN_SECRETS.extend([pat, secret, hashlib.sha256(secret.encode()).hexdigest()])
    return result


def permissions_fixture(admin, user, *, visibility="user", level="manage"):
    api("PUT", f"/users/{user['id']}/permissions", token=admin,
        body={"visibility": visibility, **{resource: level for resource in RESOURCES}})


def resource_payload(resource, label, index):
    # Consume the repository's real API examples, not a parallel made-up schema.
    schema = Path(__file__).resolve().parents[2] / "backend/schema/paths/nginx" / resource.replace("_", "-") / "post.json"
    payload = json.loads(schema.read_text())["requestBody"]["content"]["application/json"].get("example", {})
    if resource == "certificates":
        # Local custom-certificate metadata only. Never ask an external ACME CA.
        return {"provider": "other", "nice_name": f"matrix-{label}", "domain_names": [], "meta": {}}
    if resource == "access_lists":
        return {"name": f"matrix-{label}", "satisfy_any": False, "pass_auth": False, "items": [], "clients": []}
    if resource == "streams":
        return {**payload, "incoming_port": 19100 + index, "forwarding_host": "upstream", "forwarding_port": 80}
    payload.update(domain_names=[f"matrix-{resource.replace('_', '-')}-{label}.test"], certificate_id=0,
                   advanced_config="", meta={})
    if resource == "proxy_hosts":
        payload.update(forward_host="upstream", forward_port=80, access_list_id=0, locations=[])
    return payload



def custom_certificate_fixture():
    # Self-signed throwaway fixture; no external issuer, DNS or ACME calls.
    with tempfile.TemporaryDirectory(prefix="npm-pat-cert-") as folder:
        key, cert = Path(folder) / "key.pem", Path(folder) / "cert.pem"
        result = subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
                                 "-days", "1", "-subj", "/CN=matrix-upload.test",
                                 "-keyout", str(key), "-out", str(cert)],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        require(result.returncode == 0, "Local certificate fixture generation failed")
        private = key.read_bytes()
        KNOWN_SECRETS.append(private.decode().strip())
        boundary = "fixture-" + secrets.token_hex(16)
        parts = []
        for name, value in (("certificate", cert.read_bytes()), ("certificate_key", private)):
            parts.append((f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{name}.pem\"\r\n"
                          "Content-Type: application/x-pem-file\r\n\r\n").encode() + value + b"\r\n")
        return b"".join(parts) + f"--{boundary}--\r\n".encode(), "multipart/form-data; boundary=" + boundary

def run_two_user_matrix(admin):
    """Real HTTP, real DB, and real Nginx. No mocked authorization handlers.

    Only expiry is changed through the disposable container DB to avoid a 1-day
    wait; all user/permission/resource/token creation and lifecycle changes use API.
    """
    users = []
    for label in ("a", "b"):
        password = secrets.token_urlsafe(36)
        KNOWN_SECRETS.append(password)
        row = api("POST", "/users", token=admin, expected=201, body={
            "name": f"Matrix {label}", "nickname": f"matrix-{label}",
            "email": f"matrix-{label}@example.test", "roles": [],
            "auth": {"type": "password", "secret": password},
        })
        require("admin" not in row.get("roles", []), "Matrix user must not be an administrator")
        user = {"id": positive_id(row, "Matrix user"), "email": row["email"], "password": password}
        permissions_fixture(admin, user)
        login_fixture(user)
        user["write"] = mint_fixture(user, [f"{resource}:write" for resource in RESOURCES])
        user["read"] = mint_fixture(user, [f"{resource}:read" for resource in RESOURCES])
        user["objects"] = {}
        users.append(user)
    a, b = users
    certificate_body, certificate_type = custom_certificate_fixture()
    for index, user in enumerate(users):
        for resource in RESOURCES:
            path = "/nginx/" + resource.replace("_", "-")
            payload = resource_payload(resource, str(index), index)
            created = api("POST", path, token=user["write"]["token"], body=payload, expected=201)
            require(created.get("owner_user_id") == user["id"], "PAT create changed resource ownership")
            user["objects"][resource] = positive_id(created, "Matrix resource")
    progress("two ordinary own-visibility users created all six resource types using real PAT HTTP calls")

    for actor, other in ((a, b), (b, a)):
        for resource in RESOURCES:
            path = "/nginx/" + resource.replace("_", "-")
            own_path = f"{path}/{actor['objects'][resource]}"
            foreign_path = f"{path}/{other['objects'][resource]}"
            for token in (actor["read"]["token"], actor["write"]["token"]):
                rows = api("GET", path, token=token)
                require({row["id"] for row in rows} == {actor["objects"][resource]}, "List escaped own visibility")
                api("GET", own_path, token=token)
                api("GET", foreign_path, token=token, expected=403)
            changes = ({"nice_name": "matrix-updated"} if resource == "certificates" else
                       {"name": "matrix-updated"} if resource == "access_lists" else
                       {"forwarding_port": 81} if resource == "streams" else
                       {"http2_support": True} if resource == "dead_hosts" else {"block_exploits": True})
            # The certificate API intentionally has no PUT route; do not invent one.
            methods = [("DELETE", foreign_path, None)]
            if resource != "certificates":
                methods.append(("PUT", foreign_path, changes))
                own_before = api("GET", own_path, token=actor["read"]["token"])
                api("PUT", own_path, token=actor["read"]["token"], body=changes, expected=403)
                require(api("GET", own_path, token=actor["read"]["token"]) == own_before,
                        "Read-only rejected update changed the own object")
                api("PUT", own_path, token=actor["write"]["token"], body=changes)
                persisted = api("GET", own_path, token=actor["read"]["token"])
                require(all(persisted.get(key) == value for key, value in changes.items()),
                        "Allowed own update did not persist the requested fields")
            if resource in HOST_RESOURCES:
                for action in ("disable", "enable"):
                    methods.append(("POST", foreign_path + "/" + action, {}))
                    own_before = api("GET", own_path, token=actor["read"]["token"])
                    api("POST", own_path + "/" + action, token=actor["read"]["token"], body={}, expected=403)
                    require(api("GET", own_path, token=actor["read"]["token"]) == own_before,
                            "Read-only rejected toggle changed the own object")
                    api("POST", own_path + "/" + action, token=actor["write"]["token"], body={})
                    persisted = api("GET", own_path, token=actor["read"]["token"])
                    require(bool(persisted.get("enabled")) == (action == "enable"),
                            "Allowed enable/disable did not persist the requested state")
            if resource == "certificates":
                # Renew denial must precede ACME; successful external renewal is
                # intentionally outside this local self-signed certificate test.
                api("POST", own_path + "/upload", token=actor["write"]["token"],
                    body=certificate_body, content_type=certificate_type)
                uploaded = api("GET", own_path, token=actor["read"]["token"])
                require("matrix-upload.test" in uploaded.get("domain_names", []) and uploaded.get("expires_on"),
                        "Allowed certificate upload did not persist certificate metadata")
                before_upload = api("GET", foreign_path, token=other["read"]["token"])
                api("POST", foreign_path + "/upload", token=actor["write"]["token"],
                    body=certificate_body, content_type=certificate_type, expected=403)
                require(api("GET", foreign_path, token=other["read"]["token"]) == before_upload,
                        "Denied certificate upload modified foreign metadata")
                for action in ("upload", "renew"):
                    methods.append(("POST", foreign_path + "/" + action, {}))
                    api("POST", own_path + "/" + action, token=actor["read"]["token"], body={}, expected=403)
            before = api("GET", foreign_path, token=other["read"]["token"])
            for method, target, body in methods:
                api(method, target, token=actor["write"]["token"], body=body, expected=403)
                after = api("GET", foreign_path, token=other["read"]["token"])
                require(after == before, "Denied mutation changed a foreign object")
            before_create = api("GET", path, token=actor["read"]["token"])
            foreign_before_create = api("GET", path, token=other["read"]["token"])
            api("POST", path, token=actor["write"]["token"], expected=403,
                body={**resource_payload(resource, "forged", 8), "owner_user_id": other["id"]})
            # No bulk route exists: this checks default-deny for unregistered paths,
            # not successful or authorized bulk behavior.
            api("POST", path + "/bulk", token=actor["write"]["token"], body={}, expected=403)
            api("POST", path, token=actor["read"]["token"], body=resource_payload(resource, "denied", 9), expected=403)
            require(api("GET", path, token=actor["read"]["token"]) == before_create,
                    "Denied create changed the resource list")
            require(api("GET", path, token=other["read"]["token"]) == foreign_before_create,
                    "Denied forged-owner create changed the foreign resource list")
            api("DELETE", own_path, token=actor["read"]["token"], expected=403)
            still_there = api("GET", foreign_path, token=other["read"]["token"])
            require(still_there.get("id") == other["objects"][resource], "Denied mutations removed foreign object")
        metadata = api("GET", "/api-tokens", token=actor["jwt"])
        require({row["id"] for row in metadata} == {actor["read"]["id"], actor["write"]["id"]},
                "JWT token-management list exposed another user's tokens")
        api("DELETE", f"/api-tokens/{other['write']['id']}", token=actor["jwt"], expected=404)
        api("GET", "/nginx/proxy-hosts", token=other["write"]["token"])
    progress("bidirectional six-resource ownership/read-write negative matrix, token-management isolation and allowed own mutations")

    # Promotion must not widen an existing own-only PAT. A new all-visibility PAT
    # may access shared objects, but subsequent demotion must restrict it again.
    permissions_fixture(admin, a, visibility="all")
    shared = mint_fixture(a, [f"{resource}:read" for resource in RESOURCES])
    for resource in RESOURCES:
        base = "/nginx/" + resource.replace("_", "-")
        foreign = f"{base}/{b['objects'][resource]}"
        api("GET", foreign, token=a["write"]["token"], expected=403)
        api("GET", foreign, token=shared["token"])
        rows = api("GET", base, token=shared["token"])
        require({row["id"] for row in rows} == {a["objects"][resource], b["objects"][resource]},
                "New all-visibility token did not honor shared visibility")
    permissions_fixture(admin, a)
    for resource in RESOURCES:
        base = "/nginx/" + resource.replace("_", "-")
        api("GET", f"{base}/{b['objects'][resource]}", token=shared["token"], expected=403)
        rows = api("GET", base, token=shared["token"])
        require({row["id"] for row in rows} == {a["objects"][resource]}, "Visibility demotion did not filter list")
    for level in ("view", "hidden"):
        permissions_fixture(admin, a, level=level)
        for resource in RESOURCES:
            path = f"/nginx/{resource.replace('_', '-')}/{a['objects'][resource]}"
            api("GET", path, token=a["write"]["token"], expected=200 if level == "view" else 403)
            api("DELETE", path, token=a["write"]["token"], expected=403)
    permissions_fixture(admin, a)
    progress("current permission intersection and both visibility promotion cap/demotion applied to existing PATs")

    # Restricting scope must not be bypassed by object ownership or later permission changes.
    narrow = mint_fixture(a, ["proxy_hosts:read"])
    for resource in RESOURCES[1:]:
        api("GET", "/nginx/" + resource.replace("_", "-"), token=narrow["token"], expected=403)
    api("DELETE", f"/api-tokens/{narrow['id']}", token=a["jwt"])
    api("GET", "/nginx/proxy-hosts", token=narrow["token"], expected=401)
    expiring = mint_fixture(a, ["proxy_hosts:read"])
    # Exact disposable test container and validated numeric ID, never production
    # connection settings. Code/data go via stdin; no credential in args/output.
    require(type(expiring["id"]) is int and expiring["id"] > 0, "Invalid expiry fixture ID")
    source = ("import db from '/app/db.js'; const connection=db(); "
              f"await connection('api_token').where({{id:{expiring['id']}}}).update({{expires_on:'2000-01-01T00:00:00.000Z'}}); "
              "await connection.destroy();")
    result = subprocess.run(["docker", "exec", "-i", "npm-pat-test", "node", "--input-type=module"],
                            input=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
    require(result.returncode == 0, "Disposable expiry fixture update failed (details suppressed)")
    api("GET", "/nginx/proxy-hosts", token=expiring["token"], expected=401)

    # Destructive own-resource operations happen after foreign mutation checks.
    for user in users:
        for resource in RESOURCES:
            path = f"/nginx/{resource.replace('_', '-')}/{user['objects'][resource]}"
            api("DELETE", path, token=user["write"]["token"])
            api("GET", path, token=user["write"]["token"], expected=403)
    old = a["write"]["token"]
    api("PUT", f"/users/{a['id']}", token=admin, body={"is_disabled": True})
    api("GET", "/nginx/proxy-hosts", token=old, expected=401)
    api("PUT", f"/users/{a['id']}", token=admin, body={"is_disabled": False})
    api("GET", "/nginx/proxy-hosts", token=old, expected=401)
    login_fixture(a)
    before_change = mint_fixture(a, ["proxy_hosts:read"])
    changed_password = secrets.token_urlsafe(36)
    KNOWN_SECRETS.append(changed_password)
    api("PUT", f"/users/{a['id']}/auth", token=a["jwt"],
        body={"type": "password", "current": a["password"], "secret": changed_password})
    api("GET", "/nginx/proxy-hosts", token=before_change["token"], expected=401)
    a["password"] = changed_password
    login_fixture(a)
    records = api("GET", "/api-tokens", token=a["jwt"])
    invalidated = next((row for row in records if row["id"] == before_change["id"]), None)
    require(invalidated is not None and invalidated.get("status") == "revoked",
            "Password-changed token must be displayed as revoked")
    before_password = mint_fixture(a, ["proxy_hosts:read"])
    new_password = secrets.token_urlsafe(36)
    KNOWN_SECRETS.append(new_password)
    api("PUT", f"/users/{a['id']}/auth", token=admin, body={"type": "password", "secret": new_password})
    api("GET", "/nginx/proxy-hosts", token=before_password["token"], expected=401)
    a["password"] = new_password
    login_fixture(a)
    records = api("GET", "/api-tokens", token=a["jwt"])
    invalidated = next((row for row in records if row["id"] == before_password["id"]), None)
    require(invalidated is not None and invalidated.get("status") == "revoked",
            "Password-reset token must be displayed as revoked")
    before_delete = mint_fixture(a, ["proxy_hosts:read"])
    api("DELETE", f"/users/{a['id']}", token=admin)
    api("GET", "/nginx/proxy-hosts", token=before_delete["token"], expected=401)
    # Real authenticated step-up limit: wrong credentials never create records,
    # and after five failures even a correct password cannot skip the cooldown.
    before_limit = api("GET", "/api-tokens", token=b["jwt"])
    limit_payload = {"name": "Rejected limit fixture", "scopes": ["proxy_hosts:read"],
                     "password": "deliberately-wrong-fixture-password", "expires_in_days": 1}
    for _ in range(5):
        api("POST", "/api-tokens", token=b["jwt"], body=limit_payload, expected=403)
    api("POST", "/api-tokens", token=b["jwt"],
        body={**limit_payload, "password": b["password"]}, expected=429)
    require(api("GET", "/api-tokens", token=b["jwt"]) == before_limit,
            "Rejected step-up attempts created or changed tokens")
    progress("real API step-up failures return 403 then 429, without creating credentials")
    api("DELETE", f"/users/{b['id']}", token=admin)
    progress("real API own deletion, expiry DB fixture, revocation, disable/re-enable, password reset and user deletion invalidate PATs")

def main():
    health = wait_for("admin API readiness", healthy, STARTUP_SECONDS)
    require(health.get("setup") is False,
            "Refusing to run against an initialized instance; use fresh disposable volumes")
    check_ui()
    progress("fresh API health, admin HTML and compiled UI asset")

    password = secrets.token_urlsafe(36)
    KNOWN_SECRETS.append(password)
    identity = "pat-smoke@example.test"
    user = api("POST", "/users", expected=201, body={
        "name": "Disposable PAT smoke test", "nickname": "PAT smoke",
        "email": identity, "auth": {"type": "password", "secret": password},
    })
    user_id = positive_id(user, "First-run user")
    require("admin" in user.get("roles", []), "First-run user did not receive the admin role")
    require(api("GET", "/").get("setup") is True, "First-run setup did not complete")
    login = api("POST", "/tokens", body={"identity": identity, "secret": password}, allow_token=True)
    jwt = login.get("token")
    require(isinstance(jwt, str) and len(jwt.split(".")) == 3,
            "Password login did not return a JWT session")
    KNOWN_SECRETS.append(jwt)
    require(api("GET", "/users/me", token=jwt).get("id") == user_id,
            "JWT session does not identify the fixture user")
    progress("first-run setup and real password/JWT login")

    options = api("GET", "/api-tokens/options", token=jwt)
    require("proxy_hosts:write" in options.get("scopes", []) and options.get("requires_2fa") is False,
            "PAT options do not match the fresh admin account")
    payload = {"name": "Disposable Docker smoke token", "scopes": ["proxy_hosts:write"],
               "expires_in_days": 1, "password": password}
    api("POST", "/api-tokens", token=jwt, expected=403,
        body={**payload, "password": secrets.token_urlsafe(36)})
    created = api("POST", "/api-tokens", token=jwt, body=payload, expected=201, allow_token=True)
    token_id = positive_id(created, "Created PAT")
    pat = created.get("token")
    require(isinstance(pat, str) and re.fullmatch(r"npm_pat_[a-f0-9]{24}\.[A-Za-z0-9_-]{43}", pat),
            "PAT creation did not return the one-time credential in the expected format")
    require(set(created) == TOKEN_FIELDS | {"token"}, "PAT creation returned unexpected fields")
    require(created.get("status") == "active", "New token must be displayed as active")
    secret = pat.split(".", 1)[1]
    KNOWN_SECRETS.extend([pat, secret, hashlib.sha256(secret.encode()).hexdigest()])
    token_metadata(jwt, token_id)
    progress("password step-up, scoped PAT creation and metadata-only token listing")

    # A valid password alongside a PAT must still not mint a session or another PAT.
    denied = [
        ("GET", "/tokens", None),
        ("POST", "/tokens", {"identity": identity, "secret": password}),
        ("GET", "/api-tokens", None),
        ("GET", "/api-tokens/options", None),
        ("POST", "/api-tokens", payload),
        ("DELETE", f"/api-tokens/{token_id}", None),
        ("GET", "/users", None),
        ("POST", f"/users/{user_id}/login", {}),
        ("PUT", f"/users/{user_id}/auth", {"type": "password", "current": password, "secret": password}),
        ("GET", f"/users/{user_id}/2fa", None),
        ("GET", "/settings", None),
        ("GET", "/audit-log", None),
        ("GET", "/nginx/certificates", None),
        ("GET", "/nginx/proxy-hosts/future", None),
    ]
    for method, path, body in denied:
        api(method, path, token=pat, body=body, expected=403)
    progress("PAT cannot mint JWTs, manage tokens/accounts/security or exceed its scope")

    wait_proxy(HOST, False)
    wait_proxy(ALIAS, False)
    host = api("POST", "/nginx/proxy-hosts", token=pat, expected=201, body={
        "domain_names": [HOST], "forward_scheme": "http", "forward_host": "upstream",
        "forward_port": 80, "access_list_id": 0, "certificate_id": 0,
        "ssl_forced": False, "hsts_enabled": False, "hsts_subdomains": False,
        "http2_support": False, "block_exploits": False, "caching_enabled": False,
        "allow_websocket_upgrade": False, "advanced_config": "", "locations": [], "meta": {},
    })
    host_id = positive_id(host, "Created proxy host")
    host_path = f"/nginx/proxy-hosts/{host_id}"
    require(not ({"owner", "certificate", "access_list"} & set(host)),
            "PAT response exposed expanded private relations")
    hosts = api("GET", "/nginx/proxy-hosts", token=pat)
    require(isinstance(hosts, list) and [row.get("id") for row in hosts] == [host_id],
            "PAT could not list its created proxy host")
    fetched = api("GET", host_path, token=pat)
    require(fetched.get("domain_names") == [HOST] and fetched.get("forward_host") == "upstream"
            and fetched.get("forward_port") == 80, "PAT read did not match the created upstream")
    wait_proxy(HOST, True)
    progress("PAT create/list/read and actual Nginx forwarding to the Docker upstream")

    # Upstream admin roles must never widen an admin-owned PAT's raw-config boundary.
    for config in ({"advanced_config": "# admin-only fixture"}, {"locations": [{
            "path": "/fixture", "forward_scheme": "http", "forward_host": "upstream",
            "forward_port": 80, "advanced_config": "# admin-only fixture"}]}):
        api("PUT", host_path, token=pat, body=config, expected=403)
        api("PUT", host_path, token=jwt, body=config)
        api("PUT", host_path, token=pat, body={"forward_port": 80}, expected=403)
        api("PUT", host_path, token=jwt, body={"advanced_config": "", "locations": []})
        api("PUT", host_path, token=pat, body={"forward_port": 80})
    wait_proxy(HOST, True)
    progress("admin JWT can manage raw configuration; admin PAT cannot introduce or mutate it")

    api("GET", host_path + "?expand=owner", token=pat, expected=403)
    api("PUT", host_path, token=pat, body={"advanced_config": "return 200;"}, expected=403)
    fetched = api("GET", host_path, token=pat)
    require(fetched.get("advanced_config") == "", "Denied configuration update changed the host")
    updated = api("PUT", host_path, token=pat,
                  body={"domain_names": [HOST, ALIAS], "allow_websocket_upgrade": True})
    require(updated.get("domain_names") == sorted([HOST, ALIAS]) and updated.get("allow_websocket_upgrade") is True,
            "PAT update did not persist the changed proxy host")
    wait_proxy(ALIAS, True)
    wait_proxy(HOST, True)
    token_metadata(jwt, token_id, used=True)
    progress("safe update reached live Nginx; arbitrary directives and relation expansion denied")

    require(api("DELETE", host_path, token=pat) is True, "PAT deletion was not acknowledged")
    require(api("GET", "/nginx/proxy-hosts", token=pat) == [], "Deleted host is still listed")
    api("GET", host_path, token=pat, expected=403)
    wait_proxy(HOST, False)
    wait_proxy(ALIAS, False)
    progress("PAT deletion removed the API record and live forwarding configuration")

    revoked = api("DELETE", f"/api-tokens/{token_id}", token=jwt)
    require(revoked == {"revoked": True}, "JWT token revocation was not acknowledged")
    token_metadata(jwt, token_id, revoked=True, used=True)
    api("GET", "/nginx/proxy-hosts", token=pat, expected=401)
    api("GET", "/tokens", token=pat, expected=401)
    require(api("GET", "/users/me", token=jwt).get("id") == user_id,
            "JWT session stopped working after PAT revocation")
    progress("revocation is immediate, rejects credential reuse and preserves the JWT session")
    run_two_user_matrix(jwt)
    print("PASS: Docker PAT smoke test completed", flush=True)


if __name__ == "__main__":
    try:
        main()
    except SmokeFailure as error:
        print(f"FAIL: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
    except Exception as error:
        # Exception messages and tracebacks can retain credential-bearing input.
        print(f"FAIL: unexpected {type(error).__name__}; details suppressed to protect credentials",
              file=sys.stderr, flush=True)
        sys.exit(1)
