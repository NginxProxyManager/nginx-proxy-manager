# Perguntas Frequentes

## Eu tenho que usar Docker?

Sim, é assim que o projecto foi montado.

Isso facilita o suporte ao projeto quando tenho controle sobre a versão do Nginx e do NodeJS que está sendo usada. No futuro, isso pode mudar se o back-end não estiver mais usando o NodeJS e sua longa lista de dependências.

## Posso rodar em Raspberry Pi?

Sim! A imagem do docker é multi-arquitetura e é construída para uma variedade de arquiteturas. Se a sua [não está listada](https://hub.docker.com/r/jc21/nginx-proxy-manager/tags) por favor, abra
[GitHub issue](https://github.com/jc21/nginx-proxy-manager/issues/new?assignees=&labels=enhancement&template=feature_request.md&title=).

## Não consigo que os meus serviços sejam proxies correctamente?

Sua melhor aposta é pedir ajuda [à comunidade do Reddit](https://www.reddit.com/r/nginxproxymanager/). Há segurança nos números.

O Gitter é melhor deixado para qualquer pessoa que contribua com o projeto para pedir ajuda sobre internos, revisões de código, etc.

## Ao adicionar o controle de acesso com username e senha a um proxy host, não consigo mais fazer login no aplicativo

Ter uma Lista de Controle de Acesso (ACL) com o username e senha exige que o navegador sempre envie esse username e senha no cabeçalho `Authorization` em cada solicitação. Se seu aplicativo proxy também exigir autenticação (como o próprio Nginx Proxy Manager), provavelmente o aplicativo também usará o cabeçalho `Authorization` para transmitir essas informações, pois esse é o cabeçalho padronizado destinado a esse tipo de informação. No entanto, ter vários do mesmo cabeçalhos não é permitido no [padrão da Internet](https://www.rfc-editor.org/rfc/rfc7230#section-3.2.2) e quase todos os aplicativos não oferecem suporte a vários valores no cabeçalho `Authorization`. Portanto, um dos dois logins será interrompido. Isso só pode ser corrigido removendo um dos logins ou alterando o aplicativo para usar outros cabeçalhos não padrão para autorização.
