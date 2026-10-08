#!/usr/bin/env python3
"""Check forwarded Host headers against a real upstream in a disposable image."""

import http.client
import json
import socket
import ssl
import subprocess
import sys
import time
import uuid


BACKEND = r'''
import http.server, json, ssl
from urllib.parse import urlsplit

class Backend(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
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
            self.end_headers()
            self.wfile.write(json.dumps({"host": host, "origin": origin, "referer": referer,
                                        "method": self.command, "path": self.path,
                                        "body": body.decode()}).encode())

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
    certificate_id: 999, certificate: {provider: "other"}, access_list_id: 0,
    ssl_forced: false, hsts_enabled: false, http2_support: false,
    block_exploits: false, caching_enabled: false, allow_websocket_upgrade: false,
    advanced_config: "", locations: [{path: "/custom/", advanced_config: "",
        forward_scheme: "https", forward_host: "127.0.0.1", forward_port: 19443}]
};
await nginx.generateConfig("proxy_host", host);
process.exit(0);
'''


def docker(*args, **kwargs):
    return subprocess.check_output(["docker", *args], text=True, **kwargs).strip()


def request(port, tls=False, path="/", method="GET", headers=None, body=None):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        if tls:
            connection.sock = ssl._create_unverified_context().wrap_socket(
                socket.create_connection(("127.0.0.1", port), timeout=5),
                server_hostname="host-port.example.test")
        connection.request(method, path, headers=headers or {}, body=body)
        response = connection.getresponse()
        return response.status, response.getheader("Content-Type"), response.read()
    finally:
        connection.close()


def check_image(image):
    name = f"npm-host-header-smoke-{uuid.uuid4().hex[:10]}"
    backend = None
    checked = 0
    try:
        docker("run", "-d", "--name", name, "-e", "IP_RANGES_FETCH_ENABLED=false",
               "-p", "127.0.0.1::80", "-p", "127.0.0.1::443", "-p", "127.0.0.1::81",
               "--mount", "type=volume,destination=/etc/letsencrypt", image)
        ports = {p: int(docker("port", name, f"{p}/tcp").rsplit(":", 1)[1])
                 for p in (80, 443, 81)}
        deadline = time.monotonic() + 120
        while True:
            try:
                status, _, body = request(ports[81], path="/api/")
                if status == 200 and json.loads(body).get("status") == "OK":
                    break
            except (OSError, ValueError, http.client.HTTPException):
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
        time.sleep(1)
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
                            status, content_type, body = request(
                                ports[443 if tls else 80], tls, path, method,
                                {"Host": authority, "Origin": origin, "Referer": referer}, payload)
                        except (OSError, http.client.HTTPException) as error:
                            raise AssertionError((authority, path, method, str(error))) from error
                        assert status == 200 and content_type == "application/json", (
                            authority, path, method, status, body)
                        assert json.loads(body) == {"host": authority, "origin": origin,
                            "referer": referer, "method": method, "path": path,
                            "body": payload or ""}, body
                        checked += 1
        # HTTP/1.0 permits no Host. An absolute target selects our generated host.
        for prefix in ("/", "/custom/"):
            with socket.create_connection(("127.0.0.1", ports[80]), timeout=5) as sock:
                sock.sendall(f"GET http://host-port.example.test{prefix}fallback HTTP/1.0\r\n\r\n".encode())
                response = http.client.HTTPResponse(sock)
                response.begin()
                assert response.status == 200, response.status
                assert json.loads(response.read())["host"] == "host-port.example.test"
                checked += 1
        print(json.dumps({"image": image, "cases": checked, "nginx": "passed",
                          "default_and_custom_locations": "passed", "http_and_https": "passed",
                          "origin_and_referer_validation": "passed", "missing_host_fallback": "passed"}),
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
