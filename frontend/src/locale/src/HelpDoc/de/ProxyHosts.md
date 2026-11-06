## Was ist ein Proxy-Host?

Ein Proxy-Host ist der eingehende Endpunkt für einen Webdienst, den Sie weiterleiten möchten.

Er bietet optionale SSL-Terminierung für Ihren Dienst, der möglicherweise keine integrierte SSL-Unterstützung hat.

Proxy-Hosts sind die häufigste Verwendung für den Nginx Proxy Manager.

## Status und benutzerdefinierte Locations

Die Statusspalte zeigt, ob nginx den Host tatsächlich ausliefert:

- **Online**: Die Konfiguration ist aktiv.
- **Warnung**: Der Host ist online, aber eine benutzerdefinierte Location wurde deaktiviert, weil nginx sie abgelehnt hat oder ihr Ziel-Host gerade nicht aufgelöst werden kann. Ein Klick auf den Status zeigt Details.
- **Fehler**: nginx konnte die Konfiguration dieses Hosts nicht laden, daher ist er offline. Ein Klick auf den Status zeigt den Grund.
- **Deaktiviert**: Der Host wurde ausgeschaltet.

Eine fehlerhafte benutzerdefinierte Location nimmt nicht mehr den ganzen Host offline: Nur diese Location wird deaktiviert, und der Editor zeigt den Grund. Jede Location kann außerdem einzeln ausgeschaltet werden.
