# Development Notes

Requesting a SSL Certificate is a complicated process to understand.

This is an explanation of how the ACME standard of certificates works.

## Certificate Request via HTTP validation

1. You define `website.example.com` DNS record to point to `123.45.67.89`
2. You ask a Certificate Authority to give you a Certificate and initiate validation from their side
3. The CA gives you a token, and you should be running a http-only webserver on `123.45.67.89` that returns this token
4. The CA makes a request to your domain `http://website.example.com/.well-known/acme-challenge/` and gets the token
5. If the CA thinks the token matches, they issue you the certificates.

## Certificate Request via DNS validation

1. You ask a Certificate Authority to give you a Certificate and initiate validation from their side
2. The CA gives you a token, and you update the DNS records on your domain with this token
3. The CA checks the DNS record, with a timeout waiting for propagation
4. If the CA thinks the token matches, they issue you the certificates.

## ACME DNS in an isolated test environment

### Local CA

In order to have a local ACME compatible CA that you can control, you have 2 options:

- pebble by Letsencrypt
- stepca by Step

stepca is better as it has better DNS Acme validation support.

### Local DNS Provider

PowerDNS is a really good, free DNS server and acme.sh has support for it.

### Getting things to work together

Since your don't really own `website.example.com` and if you hit it with your system DNS
it will fail, you'll need to use a custom DNS responder to return an A record for this
that points to your running NPM gateway. My [dnsrouter](https://github.com/jc21/dnsrouter)
project accomplishes this nicely. After this is setup, as long as the resolv.conf points
to this dns responder, the resolution should work locally.

1. You ask the stepca CA to give you a Certificate and initiate validation
2. The CA returns a token, and you update the PDNS records on your domain with this token
3. The CA checks the DNS record, with a timeout waiting for propagation
4. If the CA thinks the token matches, they issue you the certificates.
