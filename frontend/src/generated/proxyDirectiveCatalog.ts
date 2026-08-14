// Generated from backend/config/proxy-directive-catalog.json. Do not edit by hand.
export const PROXY_DIRECTIVE_CATALOG = {
  "schemaVersion": 1,
  "profileVersion": "npm-explicit-proxy-v1",
  "defaultLocationEnabled": true,
  "directives": [
    {
      "key": "client_max_body_size",
      "frontendKey": "clientMaxBodySize",
      "directive": "client_max_body_size",
      "category": "request_limits",
      "storage": {
        "section": "directives",
        "key": "client_max_body_size"
      },
      "valueType": "size",
      "profileValue": "2000m",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_core"
      ],
      "order": 100,
      "helpKey": "nginx-options.client-max-body-size.help"
    },
    {
      "key": "proxy_http_version",
      "frontendKey": "proxyHttpVersion",
      "directive": "proxy_http_version",
      "category": "protocol_request",
      "storage": {
        "section": "directives",
        "key": "proxy_http_version"
      },
      "valueType": "enum",
      "profileValue": "1.1",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 101,
      "helpKey": "nginx-options.proxy-http-version.help"
    },
    {
      "key": "proxy_method",
      "frontendKey": "proxyMethod",
      "directive": "proxy_method",
      "category": "protocol_request",
      "storage": {
        "section": "directives",
        "key": "proxy_method"
      },
      "valueType": "method",
      "profileValue": "$request_method",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 102,
      "helpKey": "nginx-options.proxy-method.help"
    },
    {
      "key": "proxy_connect_timeout",
      "frontendKey": "proxyConnectTimeout",
      "directive": "proxy_connect_timeout",
      "category": "timeouts_retry",
      "storage": {
        "section": "directives",
        "key": "proxy_connect_timeout"
      },
      "valueType": "duration",
      "profileValue": "90s",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 103,
      "helpKey": "nginx-options.proxy-connect-timeout.help"
    },
    {
      "key": "proxy_send_timeout",
      "frontendKey": "proxySendTimeout",
      "directive": "proxy_send_timeout",
      "category": "timeouts_retry",
      "storage": {
        "section": "directives",
        "key": "proxy_send_timeout"
      },
      "valueType": "duration",
      "profileValue": "90s",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 104,
      "helpKey": "nginx-options.proxy-send-timeout.help"
    },
    {
      "key": "proxy_read_timeout",
      "frontendKey": "proxyReadTimeout",
      "directive": "proxy_read_timeout",
      "category": "timeouts_retry",
      "storage": {
        "section": "directives",
        "key": "proxy_read_timeout"
      },
      "valueType": "duration",
      "profileValue": "90s",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 105,
      "helpKey": "nginx-options.proxy-read-timeout.help"
    },
    {
      "key": "proxy_next_upstream",
      "frontendKey": "proxyNextUpstream",
      "directive": "proxy_next_upstream",
      "category": "timeouts_retry",
      "storage": {
        "section": "directives",
        "key": "proxy_next_upstream"
      },
      "valueType": "enum_list",
      "profileValue": [
        "error",
        "timeout"
      ],
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 106,
      "helpKey": "nginx-options.proxy-next-upstream.help"
    },
    {
      "key": "proxy_next_upstream_timeout",
      "frontendKey": "proxyNextUpstreamTimeout",
      "directive": "proxy_next_upstream_timeout",
      "category": "timeouts_retry",
      "storage": {
        "section": "directives",
        "key": "proxy_next_upstream_timeout"
      },
      "valueType": "duration",
      "profileValue": "0",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 107,
      "helpKey": "nginx-options.proxy-next-upstream-timeout.help"
    },
    {
      "key": "proxy_next_upstream_tries",
      "frontendKey": "proxyNextUpstreamTries",
      "directive": "proxy_next_upstream_tries",
      "category": "timeouts_retry",
      "storage": {
        "section": "directives",
        "key": "proxy_next_upstream_tries"
      },
      "valueType": "integer",
      "profileValue": 0,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 108,
      "helpKey": "nginx-options.proxy-next-upstream-tries.help"
    },
    {
      "key": "proxy_ignore_client_abort",
      "frontendKey": "proxyIgnoreClientAbort",
      "directive": "proxy_ignore_client_abort",
      "category": "protocol_request",
      "storage": {
        "section": "directives",
        "key": "proxy_ignore_client_abort"
      },
      "valueType": "boolean",
      "profileValue": false,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 109,
      "helpKey": "nginx-options.proxy-ignore-client-abort.help"
    },
    {
      "key": "proxy_socket_keepalive",
      "frontendKey": "proxySocketKeepalive",
      "directive": "proxy_socket_keepalive",
      "category": "protocol_request",
      "storage": {
        "section": "directives",
        "key": "proxy_socket_keepalive"
      },
      "valueType": "boolean",
      "profileValue": false,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 110,
      "helpKey": "nginx-options.proxy-socket-keepalive.help"
    },
    {
      "key": "proxy_bind",
      "frontendKey": "proxyBind",
      "directive": "proxy_bind",
      "category": "protocol_request",
      "storage": {
        "section": "directives",
        "key": "proxy_bind"
      },
      "valueType": "bind",
      "profileValue": "off",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 111,
      "helpKey": "nginx-options.proxy-bind.help"
    },
    {
      "key": "proxy_pass_request_headers",
      "frontendKey": "proxyPassRequestHeaders",
      "directive": "proxy_pass_request_headers",
      "category": "headers",
      "storage": {
        "section": "directives",
        "key": "proxy_pass_request_headers"
      },
      "valueType": "boolean",
      "profileValue": true,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 112,
      "helpKey": "nginx-options.proxy-pass-request-headers.help"
    },
    {
      "key": "proxy_pass_request_body",
      "frontendKey": "proxyPassRequestBody",
      "directive": "proxy_pass_request_body",
      "category": "protocol_request",
      "storage": {
        "section": "directives",
        "key": "proxy_pass_request_body"
      },
      "valueType": "boolean",
      "profileValue": true,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 113,
      "helpKey": "nginx-options.proxy-pass-request-body.help"
    },
    {
      "key": "proxy_pass_trailers",
      "frontendKey": "proxyPassTrailers",
      "directive": "proxy_pass_trailers",
      "category": "protocol_request",
      "storage": {
        "section": "directives",
        "key": "proxy_pass_trailers"
      },
      "valueType": "boolean",
      "profileValue": false,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": "1.27.2",
      "modules": [
        "http_proxy"
      ],
      "order": 114,
      "helpKey": "nginx-options.proxy-pass-trailers.help"
    },
    {
      "key": "proxy_request_buffering",
      "frontendKey": "proxyRequestBuffering",
      "directive": "proxy_request_buffering",
      "category": "buffering",
      "storage": {
        "section": "directives",
        "key": "proxy_request_buffering"
      },
      "valueType": "boolean",
      "profileValue": true,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 115,
      "helpKey": "nginx-options.proxy-request-buffering.help"
    },
    {
      "key": "proxy_buffering",
      "frontendKey": "proxyBuffering",
      "directive": "proxy_buffering",
      "category": "buffering",
      "storage": {
        "section": "directives",
        "key": "proxy_buffering"
      },
      "valueType": "boolean",
      "profileValue": true,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 116,
      "helpKey": "nginx-options.proxy-buffering.help"
    },
    {
      "key": "proxy_buffer_size",
      "frontendKey": "proxyBufferSize",
      "directive": "proxy_buffer_size",
      "category": "buffering",
      "storage": {
        "section": "directives",
        "key": "proxy_buffer_size"
      },
      "valueType": "size",
      "profileValue": "8k",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 117,
      "helpKey": "nginx-options.proxy-buffer-size.help"
    },
    {
      "key": "proxy_buffers",
      "frontendKey": "proxyBuffers",
      "directive": "proxy_buffers",
      "category": "buffering",
      "storage": {
        "section": "directives",
        "key": "proxy_buffers"
      },
      "valueType": "buffer_pair",
      "profileValue": [
        8,
        "8k"
      ],
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 118,
      "helpKey": "nginx-options.proxy-buffers.help"
    },
    {
      "key": "proxy_busy_buffers_size",
      "frontendKey": "proxyBusyBuffersSize",
      "directive": "proxy_busy_buffers_size",
      "category": "buffering",
      "storage": {
        "section": "directives",
        "key": "proxy_busy_buffers_size"
      },
      "valueType": "size",
      "profileValue": "16k",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 119,
      "helpKey": "nginx-options.proxy-busy-buffers-size.help"
    },
    {
      "key": "proxy_max_temp_file_size",
      "frontendKey": "proxyMaxTempFileSize",
      "directive": "proxy_max_temp_file_size",
      "category": "buffering",
      "storage": {
        "section": "directives",
        "key": "proxy_max_temp_file_size"
      },
      "valueType": "size",
      "profileValue": "1024m",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 120,
      "helpKey": "nginx-options.proxy-max-temp-file-size.help"
    },
    {
      "key": "proxy_temp_file_write_size",
      "frontendKey": "proxyTempFileWriteSize",
      "directive": "proxy_temp_file_write_size",
      "category": "buffering",
      "storage": {
        "section": "directives",
        "key": "proxy_temp_file_write_size"
      },
      "valueType": "size",
      "profileValue": "16k",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 121,
      "helpKey": "nginx-options.proxy-temp-file-write-size.help"
    },
    {
      "key": "proxy_limit_rate",
      "frontendKey": "proxyLimitRate",
      "directive": "proxy_limit_rate",
      "category": "buffering",
      "storage": {
        "section": "directives",
        "key": "proxy_limit_rate"
      },
      "valueType": "size",
      "profileValue": "0",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 122,
      "helpKey": "nginx-options.proxy-limit-rate.help"
    },
    {
      "key": "proxy_headers_hash_bucket_size",
      "frontendKey": "proxyHeadersHashBucketSize",
      "directive": "proxy_headers_hash_bucket_size",
      "category": "headers",
      "storage": {
        "section": "directives",
        "key": "proxy_headers_hash_bucket_size"
      },
      "valueType": "integer",
      "profileValue": 64,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 123,
      "helpKey": "nginx-options.proxy-headers-hash-bucket-size.help"
    },
    {
      "key": "proxy_headers_hash_max_size",
      "frontendKey": "proxyHeadersHashMaxSize",
      "directive": "proxy_headers_hash_max_size",
      "category": "headers",
      "storage": {
        "section": "directives",
        "key": "proxy_headers_hash_max_size"
      },
      "valueType": "integer",
      "profileValue": 512,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 124,
      "helpKey": "nginx-options.proxy-headers-hash-max-size.help"
    },
    {
      "key": "proxy_intercept_errors",
      "frontendKey": "proxyInterceptErrors",
      "directive": "proxy_intercept_errors",
      "category": "protocol_request",
      "storage": {
        "section": "directives",
        "key": "proxy_intercept_errors"
      },
      "valueType": "boolean",
      "profileValue": false,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 125,
      "helpKey": "nginx-options.proxy-intercept-errors.help"
    },
    {
      "key": "proxy_force_ranges",
      "frontendKey": "proxyForceRanges",
      "directive": "proxy_force_ranges",
      "category": "protocol_request",
      "storage": {
        "section": "directives",
        "key": "proxy_force_ranges"
      },
      "valueType": "boolean",
      "profileValue": false,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 126,
      "helpKey": "nginx-options.proxy-force-ranges.help"
    },
    {
      "key": "proxy_redirect",
      "frontendKey": "proxyRedirect",
      "directive": "proxy_redirect",
      "category": "rewrites",
      "storage": {
        "section": "directives",
        "key": "proxy_redirect"
      },
      "valueType": "enum",
      "profileValue": "off",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 127,
      "helpKey": "nginx-options.proxy-redirect.help"
    },
    {
      "key": "proxy_cookie_domain",
      "frontendKey": "proxyCookieDomain",
      "directive": "proxy_cookie_domain",
      "category": "rewrites",
      "storage": {
        "section": "directives",
        "key": "proxy_cookie_domain"
      },
      "valueType": "rewrite_list",
      "profileValue": [],
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 128,
      "helpKey": "nginx-options.proxy-cookie-domain.help"
    },
    {
      "key": "proxy_cookie_path",
      "frontendKey": "proxyCookiePath",
      "directive": "proxy_cookie_path",
      "category": "rewrites",
      "storage": {
        "section": "directives",
        "key": "proxy_cookie_path"
      },
      "valueType": "rewrite_list",
      "profileValue": [],
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 129,
      "helpKey": "nginx-options.proxy-cookie-path.help"
    },
    {
      "key": "proxy_ssl_server_name",
      "frontendKey": "proxySslServerName",
      "directive": "proxy_ssl_server_name",
      "category": "upstream_tls",
      "storage": {
        "section": "directives",
        "key": "proxy_ssl_server_name"
      },
      "valueType": "boolean",
      "profileValue": false,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 130,
      "helpKey": "nginx-options.proxy-ssl-server-name.help"
    },
    {
      "key": "proxy_ssl_name",
      "frontendKey": "proxySslName",
      "directive": "proxy_ssl_name",
      "category": "upstream_tls",
      "storage": {
        "section": "directives",
        "key": "proxy_ssl_name"
      },
      "valueType": "host_or_variable",
      "profileValue": "$proxy_host",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 131,
      "helpKey": "nginx-options.proxy-ssl-name.help"
    },
    {
      "key": "proxy_ssl_verify",
      "frontendKey": "proxySslVerify",
      "directive": "proxy_ssl_verify",
      "category": "upstream_tls",
      "storage": {
        "section": "directives",
        "key": "proxy_ssl_verify"
      },
      "valueType": "boolean",
      "profileValue": false,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 132,
      "helpKey": "nginx-options.proxy-ssl-verify.help"
    },
    {
      "key": "proxy_ssl_verify_depth",
      "frontendKey": "proxySslVerifyDepth",
      "directive": "proxy_ssl_verify_depth",
      "category": "upstream_tls",
      "storage": {
        "section": "directives",
        "key": "proxy_ssl_verify_depth"
      },
      "valueType": "integer",
      "profileValue": 1,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 133,
      "helpKey": "nginx-options.proxy-ssl-verify-depth.help"
    },
    {
      "key": "proxy_ssl_session_reuse",
      "frontendKey": "proxySslSessionReuse",
      "directive": "proxy_ssl_session_reuse",
      "category": "upstream_tls",
      "storage": {
        "section": "directives",
        "key": "proxy_ssl_session_reuse"
      },
      "valueType": "boolean",
      "profileValue": true,
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 134,
      "helpKey": "nginx-options.proxy-ssl-session-reuse.help"
    },
    {
      "key": "proxy_ssl_protocols",
      "frontendKey": "proxySslProtocols",
      "directive": "proxy_ssl_protocols",
      "category": "upstream_tls",
      "storage": {
        "section": "directives",
        "key": "proxy_ssl_protocols"
      },
      "valueType": "enum_list",
      "profileValue": [
        "TLSv1.2",
        "TLSv1.3"
      ],
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 135,
      "helpKey": "nginx-options.proxy-ssl-protocols.help"
    },
    {
      "key": "proxy_ssl_ciphers",
      "frontendKey": "proxySslCiphers",
      "directive": "proxy_ssl_ciphers",
      "category": "upstream_tls",
      "storage": {
        "section": "directives",
        "key": "proxy_ssl_ciphers"
      },
      "valueType": "cipher_list",
      "profileValue": "DEFAULT",
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 136,
      "helpKey": "nginx-options.proxy-ssl-ciphers.help"
    },
    {
      "key": "request_headers",
      "frontendKey": "requestHeaders",
      "directive": null,
      "category": "headers",
      "storage": {
        "section": "headers",
        "key": "request"
      },
      "valueType": "request_header_operations",
      "profileValue": [],
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 137,
      "helpKey": "nginx-options.request-headers.help"
    },
    {
      "key": "response_headers",
      "frontendKey": "responseHeaders",
      "directive": null,
      "category": "headers",
      "storage": {
        "section": "headers",
        "key": "response"
      },
      "valueType": "response_header_operations",
      "profileValue": [],
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_headers"
      ],
      "order": 138,
      "helpKey": "nginx-options.response-headers.help"
    },
    {
      "key": "hide_response_headers",
      "frontendKey": "hideResponseHeaders",
      "directive": "proxy_hide_header",
      "category": "headers",
      "storage": {
        "section": "headers",
        "key": "hide_response"
      },
      "valueType": "header_name_list",
      "profileValue": [],
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 139,
      "helpKey": "nginx-options.hide-response-headers.help"
    },
    {
      "key": "proxy_pass_headers",
      "frontendKey": "proxyPassHeaders",
      "directive": "proxy_pass_header",
      "category": "headers",
      "storage": {
        "section": "headers",
        "key": "pass_response"
      },
      "valueType": "header_name_list",
      "profileValue": [],
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 140,
      "helpKey": "nginx-options.proxy-pass-headers.help"
    },
    {
      "key": "proxy_ignore_headers",
      "frontendKey": "proxyIgnoreHeaders",
      "directive": "proxy_ignore_headers",
      "category": "headers",
      "storage": {
        "section": "headers",
        "key": "ignore_upstream"
      },
      "valueType": "enum_list",
      "profileValue": [],
      "emitPolicy": "always_when_proxying",
      "inheritPolicy": "materialize",
      "minVersion": null,
      "modules": [
        "http_proxy"
      ],
      "order": 141,
      "helpKey": "nginx-options.proxy-ignore-headers.help"
    }
  ]
} as const;
