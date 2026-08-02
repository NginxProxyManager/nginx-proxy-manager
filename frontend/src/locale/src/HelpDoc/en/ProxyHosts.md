## What is a Proxy Host?

A Proxy Host is the incoming endpoint for a web service that you want to forward.

It provides optional SSL termination for your service that might not have SSL support built in.

Proxy Hosts are the most common use for the Nginx Proxy Manager.

## Visual Nginx configuration

The **Advanced** tab provides structured settings for common proxy timeouts, request-body size, buffering, and upstream TLS SNI. These values are rendered in a deterministic order and take precedence over matching directives in **Custom Nginx Configuration**.

Use **Preview rendered configuration** before saving to inspect the generated server block and validation diagnostics. A full preview validates the candidate in an isolated Nginx mirror. If a referenced certificate is still being created, or the local Nginx binary is unavailable, the preview is marked partial; review the diagnostics before saving.

Do not place credentials, private keys, or other secrets in custom Nginx configuration.
