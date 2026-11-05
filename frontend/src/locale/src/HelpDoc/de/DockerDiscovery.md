## Docker-Erkennung

Auch ohne Einrichtung schlägt das Feld für den Ziel-Host Container vor, die ein Docker-Netzwerk
mit Nginx Proxy Manager teilen, sowie bereits verwendete Hosts.

Mit eingeschalteter **Docker-Erkennung** liest NPM zusätzlich die Docker-API. Dann siehst du
freigegebene Ports und den Container-Status, und auf der Seite Proxy-Hosts erscheint
**Aus Docker**, womit du einen Proxy-Host aus den `npm.*`-Labels eines Containers anlegst.

### 1. NPM Lesezugriff auf die Docker-API geben

Binde den Docker-Socket nicht direkt in NPM ein: Zugriff darauf bedeutet Root-Zugriff auf
deinen Server, und `:ro` ändert daran nichts. Starte stattdessen einen kleinen Proxy, der nur
das Lesen von Containern und Netzwerken erlaubt:

```yaml
services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy
    restart: unless-stopped
    environment:
      CONTAINERS: 1
      NETWORKS: 1
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - socket-proxy

networks:
  socket-proxy:
    internal: true
```

Hänge den NPM-Container zusätzlich an das Netzwerk `socket-proxy`.

### 2. Zwei Umgebungsvariablen am NPM-Container setzen

```
NPM_DOCKER_DISCOVERY=true
DOCKER_HOST=tcp://socket-proxy:2375
```

Unter Unraid trägst du beide als Variablen im Template des NPM-Containers ein und hängst beide
Container an dasselbe benutzerdefinierte Netzwerk. Danach den NPM-Container neu starten.

### 3. Optional: Labels an deinen Containern

```yaml
labels:
  npm.domain: "app.example.com"
  npm.port: "8080"
  npm.scheme: "http"
  npm.websocket: "true"
```

Weitere Labels: `npm.block_exploits`, `npm.caching`, `npm.http2` (true/false) und
`npm.hide=true`, um einen Container auszublenden (auch aus dem Netzwerk-Scan, solange
die Docker-Erkennung funktioniert: der Scan selbst kann keine Labels lesen).

### Fehlersuche

Funktioniert die Erkennung nicht, zeigt die Vorschlagsliste den Grund. „Connection refused“
heißt, NPM erreicht den Proxy nicht (gleiches Netzwerk?). „The Docker API denied the request“
heißt, der Proxy braucht `CONTAINERS=1` und `NETWORKS=1`. Wenn du den Socket selbst einbindest
und `PUID`/`PGID` setzt, kann NPM ihn meist nicht öffnen; der Proxy umgeht das.
