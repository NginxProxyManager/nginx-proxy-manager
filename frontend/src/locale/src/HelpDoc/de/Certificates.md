# Certificates Help

## HTTP Certificate

A HTTP validated certificate means that the Certificate Authority (CA) will
attempt to reach your domains over HTTP (not HTTPS!) and if successful, the CA
will issue your certificate.

For this method, you will have to have a _Host_ created for your domains(s) that
is accessible with HTTP. After a certificate has been given, you can modify the
_Host_ to also use this certificate for HTTPS connections. However, the _Host_
will still need to be configured for HTTP access in order for the certificate to
renew.

## DNS Certificate

A DNS validated certificate requires you to create a DNS Provider. This DNS
Provider will be used to create temporary records on your domain and then the CA
will query those records to be sure you're the owner and if successful, the CA
will issue your certificate.

You do not need a _Host_ to be created prior to requesting this type of
certificate. Nor do you need to have your _Host_ configured for HTTP access.

## Custom Certificate

Use this option to upload your own SSL Certificate, as provided by your own
Certificate Authority.

## MKCert Certificate

This option will create a self-signed Certificate for development use. When
viewing a _Host_ that using a MKCert Certificate, the browser will show errors.

## Choosing a Certificate Authority

If you're not sure, use **ZeroSSL.**
