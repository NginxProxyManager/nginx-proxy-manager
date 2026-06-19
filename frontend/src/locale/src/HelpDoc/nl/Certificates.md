## Certificaten Hulp

### HTTP Certificaat

Een HTTP gevalideerd certificaat betekent dat Let's Encrypt servers
zullen proberen om over HTTP te bereiken (niet HTTPS!) en als dat gelukt is, zal
jouw certificaat worden uitgegeven.

Voor deze zal je een _Proxy Host_ moeten hebben die is toegankelijk via HTTP en
die naar deze Nginx installatie wijst. Nadat een certificaat is uitgegeven kan je
de _Proxy Host_ wijzigen om ook HTTPS toegang te geven. Maar de _Proxy Host_ zal
nog moeten worden geconfigureerd voor HTTP toegang om het certificaat te verlengen.

Dit proces ondersteunt geen domeinen met wildcards.

### DNS Certificaat

Een DNS gevalideerd certificaat zal gebruik maken van een DNS Provider plugin. De
DNS Provider zal tijdelijke records op jouw domein maken en Let's Encrypt zal deze
records opvragen om te controleren of je de eigenaar bent. Als dat is gecontroleerd
is zal Let's Encrypt het certificaat uitgeven.

Je hebt geen _Proxy Host_ nodig om dit soort certificaat aan te vragen. Je hebt dus
geen HTTP _Proxy Host_ nodig.

Dit proces ondersteunt _wel_ domeinen met wildcards.

### Aangepast Certificaat

Gebruik deze optie om jouw eigen SSL Certificaat te uploaden, zoals
geleverd door jouw eigen Certificate Authority.
