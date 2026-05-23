## Certificates Help

### HTTP Certificate

A HTTP validated certificate means Let's Encrypt servers will
attempt to reach your domains over HTTP (not HTTPS!) and if successful, they
will issue your certificate.

For this method, you will have to have a _Proxy Host_ created for your domains(s) that
is accessible with HTTP and pointing to this Nginx installation. After a certificate
has been given, you can modify the _Proxy Host_ to also use this certificate for HTTPS
connections. However, the _Proxy Host_ will still need to be configured for HTTP access
in order for the certificate to renew.

This process _does not_ support wildcard domains.

### DNS Certificate

A DNS validated certificate requires you to use a DNS Provider plugin. This DNS
Provider will be used to create temporary records on your domain and then Let's
Encrypt will query those records to be sure you're the owner and if successful, they
will issue your certificate.

You do not need a _Proxy Host_ to be created prior to requesting this type of
certificate. Nor do you need to have your _Proxy Host_ configured for HTTP access.

This process _does_ support wildcard domains.

### Custom Certificate

Use this option to upload your own SSL Certificate, as provided by your own
Certificate Authority.
