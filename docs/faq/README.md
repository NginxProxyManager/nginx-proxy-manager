# FAQ

## Do I have to use Docker?

Yes, that's how this project is packaged.

This makes it easier to support the project when I have control over the version of Nginx and NodeJS
being used. In future this could change if the backend was no longer using NodeJS and it's long list
of dependencies.


## Can I run it on a Raspberry Pi?

Yes! The docker image is multi-arch and is built for a variety of architectures. If yours is
[not listed](https://hub.docker.com/r/jc21/nginx-proxy-manager/tags) please open a
[GitHub issue](https://github.com/jc21/nginx-proxy-manager/issues/new?assignees=&labels=enhancement&template=feature_request.md&title=).

## I can't get my service to proxy properly?

Your best bet is to ask the [Reddit community for support](https://www.reddit.com/r/nginxproxymanager/). There's safety in numbers.

Gitter is best left for anyone contributing to the project to ask for help about internals, code reviews etc.

