#!/usr/bin/env python3
"""Verify the built image using disposable containers and synthetic hosts."""

import http.client
import json
import socket
import ssl
import subprocess
import sys
import tempfile
import time
from pathlib import Path
import uuid


RENDER = r'''
import fs from "node:fs";
import assert from "node:assert/strict";
import Ajv from "ajv";
import nginx from "./internal/nginx.js";
import { getCompiledSchema } from "./schema/index.js";

const schema = await getCompiledSchema();
const responseSchema = schema.paths["/"].get.responses["200"].content["application/json"].schema;
const health = await (await fetch("http://127.0.0.1:81/api/")).json();
const validate = new Ajv({ strict: false }).compile(responseSchema);
assert.equal(validate(health), true, JSON.stringify(validate.errors));

for (const directory of ["/data/custom_ssl/npm-999", "/etc/letsencrypt/live/npm-999"]) {
    fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync("/tmp/public-ports.crt", `${directory}/fullchain.pem`);
    fs.copyFileSync("/tmp/public-ports.key", `${directory}/privkey.pem`);
}
let id = 990;
for (const type of ["proxy_host", "redirection_host", "dead_host"]) {
    for (const provider of ["other", "letsencrypt"]) {
        await nginx.generateConfig(type, {
            id: id++, enabled: true, domain_names: [`${type}-${provider}.example.test`],
            certificate_id: 999, certificate: { id: 999, provider },
            forward_scheme: "http", forward_host: "127.0.0.1", forward_port: 80,
            forward_domain_name: "destination.example.test", forward_http_code: 302,
            ssl_forced: false, hsts_enabled: false, http2_support: false,
            block_exploits: false, caching_enabled: false, access_list_id: 0,
            advanced_config: `error_page 404 =418 /custom-error;
                location = /custom-error { return 418; }
                location = /missing { return 404; }`,
        });
    }
}
await nginx.generateConfig("dead_host", {
    id: 998, enabled: true, domain_names: ["override.example.test"],
    certificate_id: 999, certificate: { id: 999, provider: "other" },
    advanced_config: "error_page 497 =308 https://override.example.test$request_uri;",
});
process.exit(0);
'''


def docker(*args, **kwargs):
    return subprocess.check_output(["docker", *args], text=True, **kwargs).strip()


def request(port, path, method="GET", headers=None, tls=False):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
    try:
        if tls:
            connection.sock = ssl._create_unverified_context().wrap_socket(
                socket.create_connection(("127.0.0.1", port), timeout=3),
                server_hostname=headers["Host"])
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        connection.close()


def check_image(image, public_http=None, public_https=None, from_files=False):
    name = f"npm-public-ports-smoke-{uuid.uuid4().hex[:10]}"
    args = ["run", "-d", "--platform", "linux/amd64", "--name", name,
            "-e", "IP_RANGES_FETCH_ENABLED=false",
            "-p", "127.0.0.1::80", "-p", "127.0.0.1::443", "-p", "127.0.0.1::81",
            "--mount", "type=volume,destination=/etc/letsencrypt"]
    port_files = tempfile.TemporaryDirectory(prefix="npm-public-ports-") if from_files else None
    if from_files:
        for protocol, port in (("HTTP", public_http), ("HTTPS", public_https)):
            Path(port_files.name, protocol).write_text(str(port))
            args.extend(["-e", f"PUBLIC_{protocol}_PORT__FILE=/run/public-ports/{protocol}"])
        args.extend(["--mount", f"type=bind,source={port_files.name},destination=/run/public-ports,readonly"])
    else:
        if public_http is not None:
            args.extend(["-e", f"PUBLIC_HTTP_PORT={public_http}"])
        if public_https is not None:
            args.extend(["-e", f"PUBLIC_HTTPS_PORT={public_https}"])
    args.append(image)
    expected_ports = {"http": public_http or 80, "https": public_https or 443}
    try:
        docker(*args)
        ports = {port: int(docker("port", name, f"{port}/tcp").rsplit(":", 1)[1])
                 for port in (80, 443, 81)}
        deadline = time.monotonic() + 90
        while True:
            try:
                status, _, body = request(ports[81], "/api/")
                health = json.loads(body)
                if status == 200 and health.get("status") == "OK":
                    break
            except (OSError, ValueError, http.client.HTTPException):
                pass
            if time.monotonic() >= deadline:
                raise AssertionError("Manager health endpoint did not become ready")
            time.sleep(2)
        assert health["public_ports"] == expected_ports, health
        docker("exec", name, "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
               "-keyout", "/tmp/public-ports.key", "-out", "/tmp/public-ports.crt",
               "-days", "1", "-subj", "/CN=audit.example.test", stderr=subprocess.DEVNULL)
        config = """server {
  listen 80;
  listen 443 ssl;
  server_name audit.example.test;
  ssl_certificate /tmp/public-ports.crt;
  ssl_certificate_key /tmp/public-ports.key;
  include conf.d/include/public-ports-ssl.conf;
  set $trust_forwarded_proto "F";
  include conf.d/include/force-ssl.conf;
  location / { return 200 "public ports smoke"; }
}
server {
  listen 80;
  server_name trusted.example.test;
  set $trust_forwarded_proto "T";
  include conf.d/include/force-ssl.conf;
  location / { return 200 "trusted HTTPS"; }
}
"""
        subprocess.run(["docker", "exec", "-i", name, "sh", "-c",
                        "cat > /data/nginx/proxy_host/999.conf"], input=config, text=True, check=True)
        subprocess.run(["docker", "exec", "-i", "-w", "/app", name,
                        "node", "--input-type=module"], input=RENDER, text=True, check=True)
        docker("exec", name, "nginx", "-t")
        docker("exec", name, "nginx", "-s", "reload")
        time.sleep(1)
        suffix = "" if expected_ports["https"] == 443 else f':{expected_ports["https"]}'
        path = "/nested/path?check=1&two=2"
        location = f"https://audit.example.test{suffix}{path}"
        for method in ("GET", "POST"):
            status, headers, _ = request(ports[80], path, method,
                                         {"Host": f'audit.example.test:{expected_ports["http"]}'})
            assert status == 301, (method, status, headers)
            assert headers.get("Location") == location, headers
        status, _, _ = request(ports[80], "/.well-known/acme-challenge/test-challenge",
                               headers={"Host": "audit.example.test"})
        assert status == 200, ("ACME exception", status)
        status, _, _ = request(ports[80], "/", headers={"Host": "trusted.example.test",
                                                        "X-Forwarded-Proto": "https"})
        assert status == 200, ("trusted forwarded HTTPS", status)
        if expected_ports["https"] != 443:
            status, headers, _ = request(ports[443], path, headers={"Host": "audit.example.test"})
            assert status == 307 and headers.get("Location") == location, (status, headers)
        cases = 0
        for host_type in ("proxy_host", "redirection_host", "dead_host"):
            for provider in ("other", "letsencrypt"):
                domain = f"{host_type}-{provider}.example.test"
                for method in ("GET", "POST"):
                    status, headers, _ = request(ports[443], path, method, {"Host": domain})
                    if expected_ports["https"] == 443:
                        assert status == 400, (domain, method, status, headers)
                    else:
                        expected = f"https://{domain}{suffix}{path}"
                        assert status == 307 and headers.get("Location") == expected, (
                            domain, method, status, headers)
                    cases += 1
                # The unrelated server-level error page must retain its behavior over TLS.
                status, _, _ = request(ports[443], "/missing", headers={"Host": domain}, tls=True)
                assert status == 418, (domain, "custom 404 handler", status)
        status, headers, _ = request(ports[443], path, headers={"Host": "override.example.test"})
        assert status == 308 and headers.get("Location") == f"https://override.example.test{path}", (
            "explicit custom 497 handler", status, headers)
        print(json.dumps({"ports": expected_ports, "health": "passed", "force_ssl": "passed",
                          "acme_exception": "passed", "trusted_forwarded_https": "passed",
                          "http_on_ssl": "passed" if expected_ports["https"] != 443 else "upstream behavior",
                          "health_response_schema": "passed", "custom_error_pages": "passed",
                          "generated_ssl_host_cases": cases}), flush=True)
    except Exception:
        subprocess.run(["docker", "logs", "--tail", "60", name], check=False)
        raise
    finally:
        subprocess.run(["docker", "rm", "-fv", name], stdout=subprocess.DEVNULL, check=False)
        if port_files is not None:
            port_files.cleanup()


if __name__ == "__main__":
    check_image(sys.argv[1], 232, 233)
    check_image(sys.argv[1])
    check_image(sys.argv[1], 232, 233, from_files=True)
