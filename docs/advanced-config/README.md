# Advanced Configuration

## Disabling IPv6

On some docker hosts IPv6 may not be enabled. In these cases, the following message may be seen in the log:

> Address family not supported by protocol

The easy fix is to add a Docker environment variable to the Nginx Proxy Manager stack:

```yml
    environment:
      DISABLE_IPV6: 'true'
```


## Custom Nginx Configurations

If you are a more advanced user, you might be itching for extra Nginx customizability.

NPM has the ability to include different custom configuration snippets in different places.

You can add your custom configuration snippet files at `/data/nginx/custom` as follow:

 - `/data/nginx/custom/root.conf`: Included at the very end of nginx.conf
 - `/data/nginx/custom/http.conf`: Included at the end of the main http block
 - `/data/nginx/custom/server_proxy.conf`: Included at the end of every proxy server block
 - `/data/nginx/custom/server_redirect.conf`: Included at the end of every redirection server block
 - `/data/nginx/custom/server_stream.conf`: Included at the end of every stream server block
 - `/data/nginx/custom/server_stream_tcp.conf`: Included at the end of every TCP stream server block
 - `/data/nginx/custom/server_stream_udp.conf`: Included at the end of every UDP stream server block

Every file is optional.


## X-FRAME-OPTIONS Header

You can configure the [`X-FRAME-OPTIONS`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options) header
value by specifying it as a Docker environment variable. The default if not specified is `deny`.

```yml
  ...
  environment:
    X_FRAME_OPTIONS: "sameorigin"
  ...
```

## OpenID Connect SSO

You can secure any of your proxy hosts with OpenID Connect authentication, providing SSO support from an identity provider like Azure AD or KeyCloak. OpenID Connect support is provided through the [`lua-resty-openidc`](https://github.com/zmartzone/lua-resty-openidc) library of [`OpenResty`](https://github.com/openresty/openresty).

You will need a few things to get started with OpenID Connect:

- A registered application with your identity provider, they will provide you with a `Client ID` and a `Client Secret`. Public OpenID Connect applications (without a client secret) are not yet supported.

- A redirect URL to send the users to after they login with the identity provider, this can be any unused URL under the proxy host, like `https://<proxy host url>/private/callback`, the server will take care of capturing that URL and redirecting you to the proxy host root. You will need to add this URL to the list of allowed redirect URLs for the application you registered with your identity provider. 

- The well-known discovery endpoint of the identity provider you want to use, this is an URL usually with the form `https://<provider URL>/.well-known/openid-configuration`.

After you have all this you can proceed to configure the proxy host with OpenID Connect authentication.

You can also add some rudimentary access control through a list of allowed emails in case your identity provider doesn't let you do that, if this option is enabled, any email not on that list will be denied access to the proxied host.

The proxy adds some headers based on the authentication result from the identity provider:

 - `X-OIDC-SUB`: The subject identifier, according to the OpenID Coonect spec: `A locally unique and never reassigned identifier within the Issuer for the End-User`.
 - `X-OIDC-EMAIL`: The email of the user that logged in, as specified in the `id_token` returned from the identity provider. The same value that will be checked for the email whitelist.
 - `X-OIDC-NAME`: The user's name claim from the `id_token`, please note that not all id tokens necessarily contain this claim.

