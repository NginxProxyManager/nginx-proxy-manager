## What is a Proxy Host?

A Proxy Host is the incoming endpoint for a web service that you want to forward.

It provides optional SSL termination for your service that might not have SSL support built in.

Proxy Hosts are the most common use for the Nginx Proxy Manager.

## Status

The status column shows whether nginx actually serves the host:

- **Online**: the configuration is active.
- **Error**: nginx could not load the configuration of this host, so it is offline. Click the status for the reason.
- **Disabled**: the host was switched off.
