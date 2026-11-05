## Was ist ein Proxy-Host?

Ein Proxy-Host ist der eingehende Endpunkt für einen Webdienst, den Sie weiterleiten möchten.

Er bietet optionale SSL-Terminierung für Ihren Dienst, der möglicherweise keine integrierte SSL-Unterstützung hat.

Proxy-Hosts sind die häufigste Verwendung für den Nginx Proxy Manager.

## Status

Die Statusspalte zeigt, ob nginx den Host tatsächlich ausliefert:

- **Online**: Die Konfiguration ist aktiv.
- **Fehler**: nginx konnte die Konfiguration dieses Hosts nicht laden, daher ist er offline. Ein Klick auf den Status zeigt den Grund.
- **Deaktiviert**: Der Host wurde ausgeschaltet.
