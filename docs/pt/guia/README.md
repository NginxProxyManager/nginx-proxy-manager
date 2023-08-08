<p align="center">
	<img src="https://nginxproxymanager.com/github.png">
	<br><br>
	<img src="https://img.shields.io/badge/version-2.10.3-green.svg?style=for-the-badge">
	<a href="https://hub.docker.com/repository/docker/jc21/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/stars/jc21/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
	<a href="https://hub.docker.com/repository/docker/jc21/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/pulls/jc21/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
</p>

Este projeto vem como uma imagem docker pré-criada que permite que você encaminhe facilmente para seus sites
executando em casa ou não, incluindo SSL grátis, sem ter que saber muito sobre Nginx ou Letsencrypt.

- [Configuração Rápida](#configuracao-rapida)
- [Configuração Completa](https://nginxproxymanager.com/pt/inicio)
- [Capturas](https://nginxproxymanager.com/pt/capturas)

## Objectivo do Projecto

Eu criei este projeto para preencher uma necessidade pessoal de fornecer aos usuários uma maneira fácil de realizar
proxy de hosts com terminação SSL e tinha que ser tão fácil que um macaco poderia fazê-lo. Este objetivo não mudou.
Embora possa haver opções avançadas, elas são opcionais e o projeto deve ser o mais simples possível
de modo que a barreira de entrada aqui é baixa.

<a href="https://www.buymeacoffee.com/jc21" target="_blank"><img src="http://public.jc21.com/github/by-me-a-coffee.png" alt="Buy Me A Coffee" style="height: 51px !important;width: 217px !important;" ></a>


## Funcionalidades

- UI atrativa e segura, baseada em [Tabler](https://tabler.github.io/)
- Crie facilmente domínios de encaminhamento, redirecionamentos, streams e hosts 404 sem saber nada sobre Nginx
- SSL grátis usando o Let's Encrypt ou forneça seu certificado personalizado próprio
- Listas de Acesso e autenticação HTTP básica para os seus hosts
- Configurações avançadas do Nginx disponíveis para super usuários
- Gestão de usuários, permissões e auditoria de log


## Hospedando sua rede doméstica

Não vou entrar em muitos detalhes aqui, mas aqui estão os princípios básicos para alguém novo neste mundo auto-hospedado.

1. Seu roteador doméstico terá uma seção de encaminhamento de porta em algum lugar. Acesse e encontre
2. Adicione o encaminhamento de porta para as portas 80 e 443 ao servidor que hospeda este projeto
3. Configure os detalhes do seu nome de domínio para apontar para sua casa, seja com um ip estático ou um serviço como DuckDNS ou [Amazon Route53](https://github.com/jc21/route53-ddns)
4. Use o Nginx Proxy Manager como seu gateway para encaminhar para seus outros serviços baseados na web


## Configuração Rápida

1. Instale o Docker e o Docker-Compose

- [Documentação para a instalação do Docker](https://docs.docker.com/install/)
- [Documentação para a instalação do Docker-Compose](https://docs.docker.com/compose/install/)

2. Crie o arquivo `docker-compose.yml` semelhante a:

```yml
version: '3.8'
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

Isso é o mínimo de configuração obrigatória. Veja a [documentação](https://nginxproxymanager.com/setup/) para mais.

3. Levante a sua stack rodando:

```bash
docker-compose up -d

# Se estiver usando docker-compose-plugin
docker compose up -d

```

4. Faça login na UI de Admin

Quando o container do Docker estiver em execução, conecte-se a ele na porta `81` para a UI de Admin.
Às vezes isso pode demorar um pouco por causa da geração das chaves.

[http://127.0.0.1:81](http://127.0.0.1:81)

Usuário Admin padrão:
```
Email:    admin@example.com
Senha: changeme
```

Imediatamente após o login com este usuário padrão, você será solicitado a modificar seus dados e alterar sua senha.


## Contribuidores

Especiais agradecimentos a [todos os nossos contribuidores](https://github.com/NginxProxyManager/nginx-proxy-manager/graphs/contributors).


## Obtendo suporte

1. [Encontrou um bug?](https://github.com/NginxProxyManager/nginx-proxy-manager/issues)
2. [Discussões](https://github.com/NginxProxyManager/nginx-proxy-manager/discussions)
3. [Desenvolvimento Gitter](https://gitter.im/nginx-proxy-manager/community)
4. [Reddit](https://reddit.com/r/nginxproxymanager)
