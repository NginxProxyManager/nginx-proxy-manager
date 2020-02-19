## Advanced Nginx Configuration

If you are a more advanced user, you might be itching for extra Nginx customizability.

NPM has the ability to include different custom configuration snippets in different places.

You can add your custom configuration snippet files at `/data/nginx/custom` as follow:

`/data/nginx/custom/root.conf`: Included at the very end of nginx.conf
`/data/nginx/custom/http.conf`: Included at the end of the main http block
`/data/nginx/custom/server_proxy.conf`: Included at the end of every proxy server block
`/data/nginx/custom/server_redirect.conf`: Included at the end of every redirection server block
`/data/nginx/custom/server_stream.conf`: Included at the end of every stream server block
`/data/nginx/custom/server_stream_tcp.conf`: Included at the end of every TCP stream server block
`/data/nginx/custom/server_stream_udp.conf`: Included at the end of every UDP stream server block

Every file is optional.
