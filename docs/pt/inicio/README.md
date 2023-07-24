# Início

## Rodando a aplicação

Crie o arquivo `docker-compose.yml`:

```yml
version: '3.8'
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      # Essas portas são no formato <porta-no-host>:<porta-no-container>
      - '80:80' # Porta HTTP pública
      - '443:443' # Porta HTTPS pública
      - '81:81' # Porta da web do administrador
      # Adicione qualquer outra porta que você deseja expor
      # - '21:21' # FTP

    # Descomente a próxima linha se você não declarar alguma coisa na seção
    # environment:
      # Descomente isso se você quiser mudar a localização do
      # arquivo SQLite DB dentro do container
      # DB_SQLITE_FILE: "/data/database.sqlite"

      # Descomente isto se IPv6 não estiver ativado em seu host
      # DISABLE_IPV6: 'true'

    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

Então, rode:

```bash
docker-compose up -d
```

## Usando o banco de dados MySQL / MariaDB

Se você optar pela configuração do MySQL, precisará fornecer o servidor de banco de dados. Você também pode usar o MariaDB. Aqui estão as versões mínimas suportadas:

- MySQL v5.7.8+
- MariaDB v10.2.7+

É fácil usar outro container docker para o seu banco de dados e vinculá-lo como parte da stack do Docker, e é isso que o seguinte exemplo mostra.

Aqui está um exemplo de como será o seu `docker-compose.yml` usando um container MariaDB

```yml
version: '3.8'
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      # Essas portas são no formato <porta-no-host>:<porta-no-container>
      - '80:80' # Porta HTTP pública
      - '443:443' # Porta HTTPS pública
      - '81:81' # Porta da web do administrador
      # Adicione qualquer outra porta que você deseja expor
      # - '21:21' # FTP
    environment:
      # Parâmetros de conexão MySQL/MariaDB:
      DB_MYSQL_HOST: "db"
      DB_MYSQL_PORT: 3306
      DB_MYSQL_USER: "npm"
      DB_MYSQL_PASSWORD: "npm"
      DB_MYSQL_NAME: "npm"
      # Descomente isto se IPv6 não estiver ativado em seu host
      # DISABLE_IPV6: 'true'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
    depends_on:
      - db

  db:
    image: 'jc21/mariadb-aria:latest'
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: 'npm'
      MYSQL_DATABASE: 'npm'
      MYSQL_USER: 'npm'
      MYSQL_PASSWORD: 'npm'
    volumes:
      - ./mysql:/var/lib/mysql
```

::: warning

Observe que as variáveis de ambiente `DB_MYSQL_*` terão precedência sobre as variáveis `DB_SQLITE_*`. Portanto, se você mantiver as variáveis MySQL, não poderá usar o SQLite.

:::

## Rodando em dispositivos Raspberry PI / ARM

As imagens do Docker suportam as seguintes arquiteturas:
- amd64
- arm64
- armv7

As imagens do Docker são um manifesto de todas as compilações do Docker de arquiteturas suportadas, então isso significa que você não precisa se preocupar em fazer nada de especial e pode seguir as instruções comuns acima.

Dê uma olhada nas [tags no dockerhub](https://hub.docker.com/r/jc21/nginx-proxy-manager/tags)
para uma lista de arquiteturas suportadas e se você quiser uma que não existe,
[crie um feature request](https://github.com/NginxProxyManager/nginx-proxy-manager/issues/new?assignees=&labels=enhancement&template=feature_request.md&title=).

Além disso, se você ainda não sabe, siga [este guia para instalar o docker e o docker-compose](https://manre-universe.net/how-to-run-docker-and-docker-compose-on-raspbian/)
em Raspbian.

Note que a imagem `jc21/mariadb-aria:latest` poderá apresentar alguns problemas em aguns dispositivos ARM, se você quiser separar o container do banco de dados, use a imagem `yobasystems/alpine-mariadb:latest`.

## Execução inicial

Depois que o aplicativo estiver a rodar pela primeira vez, o seguinte acontecerá:

1. As chaves GPG serão geradas e salvas na pasta data
2. O banco de dados inicializará com estruturas de tabela
3. Um usuário administrador padrão será criado

Esse processo pode levar alguns minutos, dependendo da sua máquina.

## Usuário do Administrador Padrão

```
Email:    admin@example.com
Password: changeme
```

Após o login com esse usuário padrão, você será solicitado a modificar seus detalhes e alterar sua senha...
