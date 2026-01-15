Some explanation to this folder since it caused confusion: NPMplus uses nginx, not caddy. <br>
This folder is about a different image/container, which needs to be actively deployed by you, if you want it. <br>
This folder is used to create a caddy image, which support h2c and redirects all incoming http request to https and does nothing else. <br>
This could be used to disable http in NPMplus and setup this caddy image to have a catch all redirect. <br>
Not letting NPMplus even run on http and using caddy to redirect to https is a way stricter way to enforce https since it will even work if you don't enable the force https button in your hosts.
