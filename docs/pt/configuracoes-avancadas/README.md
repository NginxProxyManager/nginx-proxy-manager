# Configurações Avançadas

## Rodando processos como usuário/grupo

Por padrão, os serviços (nginx etc) serão executados como usuário `root` dentro do container do docker.
Você pode alterar esse comportamento definindo as seguintes variáveis de ambiente.
Elas não apenas executarão os serviços como esse usuário/grupo, elas mudarão a propriedade
nas pastas `data` e `letsencrypt` na inicialização.

```yml
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    environment:
      PUID: 1000
      PGID: 1000
    # ...
```

Isso pode fazer com que o container falhe ao inicializar em certos sistema, por falta de permissão para rodar a aplicação na porta 80. A única forma de resolver isso é remover as variáveis e rodar com o usuário root.

## Melhor prática: use uma rede de Docker

Para aqueles que têm alguns de seus serviços a rodar em Docker no mesmo host assim como NPM, aqui está um truque para garantir que as coisas fiquem um pouco melhor. Ao criar uma rede de docker personalizada, você não precisa publicar portas para seus serviços em todas as interfaces do host do Docker.

Crie uma rede, por exemplo, "Scoobydoo":

```bash
docker network create scoobydoo
```

Em seguida, adicione o seguinte ao arquivo `cocker-compose.yml` para o NPM e qualquer outro serviço em execução neste host do Docker:

```yml
networks:
  default:
    external: true
    name: scoobydoo
```

Vejamos um exemplo de Portainer:

```yml
version: '3.8'
services:

  portainer:
    image: portainer/portainer
    privileged: true
    volumes:
      - './data:/data'
      - '/var/run/docker.sock:/var/run/docker.sock'
    restart: unless-stopped

networks:
  default:
    external: true
    name: scoobydoo
```

Agora, na interface do usuário do NPM, você pode criar um host proxy com `portainer` como o nome do host,
e porta `9000` como a porta. Mesmo que esta porta não esteja listada no arquivo docker-compose, é "exposto" pela imagem do Portainer Docker para você e não está disponível em hosts do Docker fora desta rede. O nome do serviço é usado como o
hostname, portanto, verifique se os nomes dos seus serviços são únicos ao usar a mesma rede.

## Docker Healthcheck

O `Dockerfile` que levanta este projeto não inclui um` healthcheck`, mas você pode optar por usar este recurso adicionando o seguinte ao serviço no seu arquivo `docker-compose.yml`:

```yml
healthcheck:
  test: ["CMD", "/bin/check-health"]
  interval: 10s
  timeout: 3s
```

## Docker File Secrets

Esta imagem suporta o uso de secrets do Docker para importação de arquivos e manter os nomes de usuário ou senhas sensíveis a serem passados ou preservados no texto simples.

Você pode definir qualquer variável de ambiente de um arquivo afixando `__FILE` (duplo-underscore FILE) ao nome da variável de ambiente.

```yml
version: '3.8'

secrets:
  # Secrets são arquivos de texto de linha única, onde o único conteúdo é a secret
  # Os caminhos neste exemplo supõem que os segredos sejam mantidos na pasta local chamada ".secrets"
  DB_ROOT_PWD:
    file: .secrets/db_root_pwd.txt
  MYSQL_PWD:
    file: .secrets/mysql_pwd.txt

services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      # Porta HTTP pública
      - '80:80'
      # Porta HTTPS pública
      - '443:443'
      # Porta da web do administrador
      - '81:81'
    environment:
      # These are the settings to access your db
      DB_MYSQL_HOST: "db"
      DB_MYSQL_PORT: 3306
      DB_MYSQL_USER: "npm"
      # DB_MYSQL_PASSWORD: "npm"  # use secrets ao invés disso
      DB_MYSQL_PASSWORD__FILE: /run/secrets/MYSQL_PWD
      DB_MYSQL_NAME: "npm"
      # If you would rather use Sqlite, remove all DB_MYSQL_* lines above
      # Uncomment this if IPv6 is not enabled on your host
      # DISABLE_IPV6: 'true'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
    secrets:
      - MYSQL_PWD
    depends_on:
      - db

  db:
    image: jc21/mariadb-aria
    restart: unless-stopped
    environment:
      # MYSQL_ROOT_PASSWORD: "npm"  # use secret instead
      MYSQL_ROOT_PASSWORD__FILE: /run/secrets/DB_ROOT_PWD
      MYSQL_DATABASE: "npm"
      MYSQL_USER: "npm"
      # MYSQL_PASSWORD: "npm"  # use secret instead
      MYSQL_PASSWORD__FILE: /run/secrets/MYSQL_PWD
    volumes:
      - ./data/mysql:/var/lib/mysql
    secrets:
      - DB_ROOT_PWD
      - MYSQL_PWD
```


## Disabling IPv6

Em alguns hosts do Docker, o IPv6 não pode estar ativado.Nesses casos, a seguinte mensagem pode ser vista no log:

> Endereço Família não suportada por protocolo

A correção fácil é adicionar uma variável de ambiente do docker à pilha do gerenciador de proxy nginx:

```yml
    environment:
      DISABLE_IPV6: 'true'
```


## Configurações NGINX personalizadas

Se você é um usuário mais avançado, pode estar ansioso pela personalização extra do NGINX.

O NPM tem a capacidade de incluir diferentes trechos de configuração personalizados em diferentes lugares.

Você pode adicionar seus arquivos de snippet de configuração personalizados em `/data/nginx/personaliza` como seguinte:

 - `/data/nginx/custom/root.conf`: Incluído no final do nginx.conf
 - `/data/nginx/custom/http_top.conf`: Incluído no topo do bloco HTTP principal
 - `/data/nginx/custom/http.conf`: Incluído no final do bloco HTTP principal
 - `/data/nginx/custom/events.conf`: Incluído no final do bloco de eventos
 - `/data/nginx/custom/stream.conf`: Incluído no final do bloco de fluxo principal
 - `/data/nginx/custom/server_proxy.conf`: Incluído no final de cada bloco de servidor proxy
 - `/data/nginx/custom/server_redirect.conf`: Incluído no final de cada bloco de servidor de redirecionamento
 - `/data/nginx/custom/server_stream.conf`: Incluído no final de cada bloco de servidor de fluxo
 - `/data/nginx/custom/server_stream_tcp.conf`: Incluído no final de cada bloco de servidor de fluxo TCP
 - `/data/nginx/custom/server_stream_udp.conf`: Incluído no final de cada bloco de servidor de fluxo UDP

Cada arquivo é opcional.


## X-FRAME-OPTIONS Header

Você pode configurar o [`X-FRAME-OPTIONS`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options) cabeçalho valor especificando -o como uma variável de ambiente do Docker.O padrão, se não especificado.

```yml
  ...
  environment:
    X_FRAME_OPTIONS: "sameorigin"
  ...
```
