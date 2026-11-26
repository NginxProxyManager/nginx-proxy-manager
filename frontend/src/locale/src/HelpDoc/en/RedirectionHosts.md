## What is a Redirection Host?

A Redirection Host will redirect requests from the incoming domain and push the
viewer to another domain.

The most common reason to use this type of host is when your website changes
domains but you still have search engine or referrer links pointing to the old domain.

Choose the protocol in **Scheme** and enter the destination without
the protocol in **Forward Domain**. For example, to redirect to
`https://example.com:8443`, select **https** and enter `example.com:8443`.
Choose **Auto** to use the same scheme as the incoming request.
