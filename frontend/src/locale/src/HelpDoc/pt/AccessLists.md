## O que é uma Access List?

As *Access Lists* fornecem uma lista de permissões (whitelist) ou bloqueios (blacklist)
de endereços IP específicos de clientes, juntamente com autenticação para os *Proxy Hosts*
via Autenticação HTTP Básica (*Basic Auth*).

Podes configurar múltiplas regras de cliente, nomes de utilizador e palavras-passe
para uma única *Access List*, e depois aplicá-la a um ou mais *Proxy Hosts*.

Isto é especialmente útil para serviços web encaminhados que não têm mecanismos
de autenticação integrados ou quando pretendes proteger o acesso contra clientes desconhecidos.
