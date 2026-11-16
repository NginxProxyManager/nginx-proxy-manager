## What is a Proxy Host?

A Proxy Host is the incoming endpoint for a web service that you want to forward.

It provides optional SSL termination for your service that might not have SSL support built in.

Proxy Hosts are the most common use for the Nginx Proxy Manager.

## Status and custom locations

The status column shows whether nginx actually serves the host:

- **Online**: the configuration is active.
- **Warning**: the host is online, but a custom location needs attention: nginx rejected it, so it was set aside (not served), or its forward host cannot be resolved right now (it stays enabled and answers 502 until the name resolves, then works again on its own). Click the status for details.
- **Error**: nginx could not load the configuration of this host, so it is offline. Click the status for the reason.
- **Disabled**: the host was switched off.

A broken custom location no longer takes the whole host offline: a location nginx rejects is set aside, the rest of the host stays online, and the editor shows why (fix it and save the host to bring it back). A location whose forward host doesn't resolve is not set aside: it answers 502 until the host resolves, nothing has to be enabled again. Each location can also be switched off on its own.
