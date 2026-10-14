#!/usr/bin/env python3
"""Check forwarded Host headers against a real upstream in a disposable image."""

import base64
import json
import subprocess
import sys
import time
import uuid


BACKEND = r'''
import http.server, json, ssl
from urllib.parse import urlsplit

class Backend(http.server.BaseHTTPRequestHandler):
    requests = 0

    def do_GET(self):
        Backend.requests += 1
        request_number = Backend.requests
        host = self.headers.get("Host")
        origin = self.headers.get("Origin")
        referer = self.headers.get("Referer")
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        self.send_response(200)
        if origin and (host != urlsplit(origin).netloc or host != urlsplit(referer).netloc):
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<script>window.top.location.href='/Main_Login.asp';</script>")
        else:
            self.send_header("Content-Type", "application/json")
            self.send_header("X-Upstream-Request", str(request_number))
            self.end_headers()
            response = {"host": host, "origin": origin, "referer": referer,
                        "method": self.command, "path": self.path, "body": body.decode()}
            if self.path.endswith(".js"):
                response["request_number"] = request_number
            self.wfile.write(json.dumps(response).encode())

    do_POST = do_GET

    def log_message(self, *args):
        pass

context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain("/data/custom_ssl/npm-999/fullchain.pem",
                        "/data/custom_ssl/npm-999/privkey.pem")
server = http.server.ThreadingHTTPServer(("127.0.0.1", 19443), Backend)
server.socket = context.wrap_socket(server.socket, server_side=True)
server.serve_forever()
'''

RENDER = r'''
import nginx from "./internal/nginx.js";

const host = {
    id: 999, enabled: true, domain_names: ["host-port.example.test", "[::1]"],
    forward_scheme: "https", forward_host: "127.0.0.1", forward_port: 19443,
    certificate_id: 999, certificate: {id: 999, provider: "other"}, access_list_id: 0,
    ssl_forced: false, hsts_enabled: false, http2_support: false,
    block_exploits: false, caching_enabled: true, allow_websocket_upgrade: false,
    advanced_config: "", locations: [{path: "/custom/", advanced_config: "",
        forward_scheme: "https", forward_host: "127.0.0.1", forward_port: 19443}]
};
await nginx.generateConfig("proxy_host", host);
process.exit(0);
'''


def docker(*args, **kwargs):
    return subprocess.check_output(["docker", *args], text=True, **kwargs).strip()


# Keep all traffic on the tested container's loopback interface so this also
# works when the CI agent talks to a Docker daemon on another host.
REQUEST = r'''
import base64, http.client, json, socket, ssl, sys
args = json.load(sys.stdin)
connection = None
sock = None
try:
    if args["http10"]:
        sock = socket.create_connection(("127.0.0.1", 80), timeout=5)
        target = "http://host-port.example.test" + args["path"]
        sock.sendall(f"GET {target} HTTP/1.0\r\n\r\n".encode())
        response = http.client.HTTPResponse(sock)
        response.begin()
    else:
        port = 443 if args["tls"] else 80
        if args["admin"]:
            port = 81
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        if args["tls"]:
            connection.sock = ssl._create_unverified_context().wrap_socket(
                socket.create_connection(("127.0.0.1", port), timeout=5),
                server_hostname="host-port.example.test")
        connection.request(args["method"], args["path"], headers=args["headers"], body=args["body"])
        response = connection.getresponse()
    print(json.dumps({"status": response.status, "headers": dict(response.getheaders()),
                      "body": base64.b64encode(response.read()).decode()}))
finally:
    if connection is not None:
        connection.close()
    if sock is not None:
        sock.close()
'''


def request(container, tls=False, path="/", method="GET", headers=None, body=None, admin=False, http10=False):
    payload = {"tls": tls, "path": path, "method": method, "headers": headers or {},
               "body": body, "admin": admin, "http10": http10}
    try:
        result = json.loads(docker("exec", "-i", container, "python3", "-S", "-c", REQUEST,
                                   input=json.dumps(payload), stderr=subprocess.DEVNULL, timeout=15))
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise OSError("Request inside the tested container failed") from error
    return result["status"], result["headers"], base64.b64decode(result["body"])


def wait_for_generated_host(container):
    deadline = time.monotonic() + 60
    while True:
        try:
            for tls in (False, True):
                for prefix in ("/", "/custom/"):
                    path = prefix + "readiness"
                    status, headers, body = request(container, tls, path,
                                                   headers={"Host": "host-port.example.test:233"})
                    data = json.loads(body)
                    assert status == 200 and headers.get("Content-Type") == "application/json"
                    assert data["host"] == "host-port.example.test:233" and data["path"] == path
            return
        except (OSError, ValueError, AssertionError, KeyError):
            if time.monotonic() >= deadline:
                raise AssertionError("Generated HTTP/HTTPS host and upstream did not become ready")
            time.sleep(0.5)


def check_image(image):
    name = f"npm-host-header-smoke-{uuid.uuid4().hex[:10]}"
    backend = None
    checked = 0
    try:
        docker("run", "-d", "--name", name, "-e", "IP_RANGES_FETCH_ENABLED=false",
               "--mount", "type=volume,destination=/etc/letsencrypt", image)
        deadline = time.monotonic() + 120
        while True:
            try:
                status, _, body = request(name, path="/api/", admin=True)
                if status == 200 and json.loads(body).get("status") == "OK":
                    break
            except (OSError, ValueError):
                pass
            if time.monotonic() >= deadline:
                raise AssertionError("Manager health endpoint did not become ready")
            time.sleep(1)
        docker("exec", name, "mkdir", "-p", "/data/custom_ssl/npm-999")
        docker("exec", name, "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
               "-keyout", "/data/custom_ssl/npm-999/privkey.pem",
               "-out", "/data/custom_ssl/npm-999/fullchain.pem",
               "-days", "1", "-subj", "/CN=host-port.example.test", stderr=subprocess.DEVNULL)
        backend = subprocess.Popen(["docker", "exec", name, "python3", "-S", "-c", BACKEND],
                                   stdout=subprocess.DEVNULL)
        subprocess.run(["docker", "exec", "-i", "-w", "/app", name,
                        "node", "--input-type=module"], input=RENDER, text=True, check=True)
        docker("exec", name, "nginx", "-t")
        docker("exec", name, "nginx", "-s", "reload")
        wait_for_generated_host(name)
        for tls, authorities in [
            (False, ["host-port.example.test", "host-port.example.test:80",
                     "host-port.example.test:232"]),
            (True, ["host-port.example.test", "host-port.example.test:443",
                    "host-port.example.test:233", "HOST-PORT.EXAMPLE.TEST:233",
                    "[::1]:233"]),
        ]:
            scheme = "https" if tls else "http"
            for authority in authorities:
                for prefix in ("/", "/custom/"):
                    for method in ("GET", "POST"):
                        origin = f"{scheme}://{authority}"
                        referer = origin + "/settings"
                        path = prefix + "apply?one=1&two=2"
                        payload = "rule=example" if method == "POST" else None
                        try:
                            status, headers, body = request(
                                name, tls, path, method,
                                {"Host": authority, "Origin": origin, "Referer": referer}, payload)
                        except OSError as error:
                            raise AssertionError((authority, path, method, str(error))) from error
                        assert status == 200 and headers.get("Content-Type") == "application/json", (
                            authority, path, method, status, body)
                        assert json.loads(body) == {"host": authority, "origin": origin,
                            "referer": referer, "method": method, "path": path,
                            "body": payload or ""}, body
                        checked += 1
        # HTTP/1.0 permits no Host. An absolute target selects our generated host.
        for prefix in ("/", "/custom/"):
            status, _, body = request(name, path=prefix + "fallback", http10=True)
            assert status == 200, status
            assert json.loads(body)["host"] == "host-port.example.test"
            checked += 1

        cache_cases = 0
        for prefix in ("/", "/custom/"):
            path = prefix + f"cache-{uuid.uuid4().hex}.js"
            cached = {}
            authorities = [(False, "host-port.example.test:232"), (True, "host-port.example.test:233")]
            for _ in range(2):
                for tls, authority in authorities:
                    origin = f"{'https' if tls else 'http'}://{authority}"
                    status, headers, body = request(name, tls, path,
                        headers={"Host": authority, "Origin": origin, "Referer": origin + "/settings"})
                    data = json.loads(body)
                    assert status == 200 and data["host"] == authority, ("cache", prefix, authority, status, data)
                    serial = headers.get("X-Upstream-Request")
                    assert serial and str(data["request_number"]) == serial, (headers, data)
                    if authority in cached:
                        # A dynamic upstream counter must not change on a real cache hit.
                        assert (serial, body) == cached[authority], ("cache hit", authority, cached, serial, body)
                    else:
                        cached[authority] = (serial, body)
                    cache_cases += 1
            assert len({serial for serial, _ in cached.values()}) == 2, cached
        checked += cache_cases
        print(json.dumps({"image": image, "cases": checked, "nginx": "passed",
                          "default_and_custom_locations": "passed", "http_and_https": "passed",
                          "origin_and_referer_validation": "passed", "missing_host_fallback": "passed", "cached_asset_cases": cache_cases,
                          "cache_port_isolation_and_hits": "passed", "generated_host_readiness": "passed"}),
              flush=True)
    except Exception:
        subprocess.run(["docker", "logs", "--tail", "30", name], check=False)
        raise
    finally:
        subprocess.run(["docker", "rm", "-fv", name], stdout=subprocess.DEVNULL, check=False)
        if backend is not None:
            backend.wait(timeout=10)


if __name__ == "__main__":
    check_image(sys.argv[1])
