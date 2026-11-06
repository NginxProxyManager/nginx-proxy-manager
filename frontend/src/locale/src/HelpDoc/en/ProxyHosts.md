## What is a Proxy Host?

A Proxy Host is the incoming endpoint for a web service that you want to forward.

It provides optional SSL termination for your service that might not have SSL support built in.

Proxy Hosts are the most common use for the Nginx Proxy Manager.

## Status and custom locations

The status column shows whether nginx actually serves the host:

- **Online**: the configuration is active.
- **Warning**: the host is online, but a custom location was disabled because nginx rejected it, or its forward host cannot be resolved right now. Click the status for details.
- **Error**: nginx could not load the configuration of this host, so it is offline. Click the status for the reason.
- **Disabled**: the host was switched off.

A broken custom location no longer takes the whole host offline: only that location is disabled, and the editor shows why. Each location can also be switched off on its own.
