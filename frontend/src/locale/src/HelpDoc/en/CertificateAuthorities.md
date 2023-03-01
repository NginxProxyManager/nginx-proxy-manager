# Certificate Authorities Help

## What is a Certificate Authority?

A **Certificate Authority (CA)**, also sometimes referred to as a
**Certification Authority**, is a company or organization that acts to validate
the identities of entities (such as websites, email addresses, companies, or
individual persons) and bind them to cryptographic keys through the issuance of
electronic documents known as digital certificates.

## Which CA should I use?

Not all CA's are created equal and you would be fine to use the default,
ZeroSSL.

When using another CA it's worth considering the wildcard support and number of
hosts-per-certificate that it supports.

## Can I use my own custom CA?

Yes, you can run your own CA software. You would only do this if you have a
greater understanding of the SSL ecosystem.

When requesting SSL Certificates through your custom CA and while they will be
successful, browsers will not automatically trust your CA and visiting hosts
using certificates issued by that CA will show errors.

- [StepCA](https://smallstep.com/docs/step-ca)
- [Pebble](https://github.com/letsencrypt/pebble)
