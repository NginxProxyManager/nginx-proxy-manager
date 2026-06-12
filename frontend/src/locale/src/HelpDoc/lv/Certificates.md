## Sertifikāti Palīdzība

### HTTP sertifikāts

HTTP apstiprināts sertifikāts nozīmē Let 's šifrēt serveri būs
mēģināt sasniegt savus domēnus virs HTTP (ne HTTPS!) un, ja veiksmīgi, tie
izdos savu sertifikātu.

Šai metodei, jums būs jābūt  proxy Host  izveidots jūsu domēniem, kas
ir pieejama ar HTTP un norāda uz šo Nginx instalāciju. Pēc sertifikāta
ir dota, jūs varat mainīt  Proxy Host , lai izmantotu arī šo sertifikātu HTTPS
savienojumi. Tomēr joprojām būs nepieciešams konfigurēt  proxy resursdatoru , lai piekļūtu HTTP
lai sertifikātu atjaunotu.

Šis process  neatbalsta windcard domēnus.

### DNS sertifikāts

DNS apstiprināts sertifikāts prasa jums izmantot DNS Provider spraudnis. Šī DNS
Provaiders tiks izmantots, lai izveidotu pagaidu ierakstus uz jūsu domēna un tad pieņemsim
Šifrēt būs vaicāt šos ierakstus, lai pārliecinātos, ka esat īpašnieks un ja veiksmīgi, tie
izdos savu sertifikātu.

Jums nav nepieciešams  proxy host  izveidot pirms pieprasīt šāda veida
sertifikāts. Tāpat jums nav nepieciešams, lai jūsu  proxy host  konfigurētu HTTP piekļuvei.

Šis process   does  atbalsta windcard domēnus.

### Pielāgots sertifikāts

Izmantojiet šo iespēju, lai augšupielādētu savu SSL sertifikātu kā to nodrošina jūsu
Sertifikāta iestāde.
