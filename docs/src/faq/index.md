---
outline: deep
---

# FAQ

## Do I have to use Docker?

Yes, that's how this project is packaged.

This makes it easier to support the project when we have control over the version of Nginx other packages
use by the project.

## Can I run it on a Raspberry Pi?

Yes! The docker image is multi-arch and is built for a variety of architectures. If yours is
[not listed](https://hub.docker.com/r/jc21/nginx-proxy-manager/tags) please open a
[GitHub issue](https://github.com/NginxProxyManager/nginx-proxy-manager/issues/new?assignees=&labels=enhancement&template=feature_request.md&title=).

## I can't get my service to proxy properly?

Your best bet is to ask the [Reddit community for support](https://www.reddit.com/r/nginxproxymanager/). There's safety in numbers.

## When adding username and password access control to a proxy host, I can no longer login into the app.

Having an Access Control List (ACL) with username and password requires the browser to always send this username and password in the `Authorization` header on each request. If your proxied app also requires authentication (like Nginx Proxy Manager itself), most likely the app will also use the `Authorization` header to transmit this information, as this is the standardized header meant for this kind of information. However having multiples of the same headers is not allowed in the [internet standard](https://www.rfc-editor.org/rfc/rfc7230#section-3.2.2) and almost all apps do not support multiple values in the `Authorization` header. Hence one of the two logins will be broken. This can only be fixed by either removing one of the logins or by changing the app to use other non-standard headers for authorization.
