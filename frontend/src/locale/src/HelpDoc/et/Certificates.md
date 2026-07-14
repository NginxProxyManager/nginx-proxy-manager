## Sertifikaatide abi

### HTTP-sertifikaat

HTTP-valideeritud sertifikaat tähendab, et Let's Encrypti serverid proovivad teie domeenidega ühendust luua HTTP (mitte HTTPS!) kaudu ja kui see õnnestub, väljastavad nad teile sertifikaadi.

Selle meetodi jaoks peate oma domeeni(de) jaoks looma _puhverserveri hosti_, millele pääseb ligi HTTP kaudu ja mis osutab sellele Nginx Proxy Manageri installatsioonile. Pärast sertifikaadi väljastamist saate muuta _puhverserveri hosti_, et seda sertifikaati ka HTTPS-ühenduste jaoks kasutada. Sertifikaadi uuendamiseks tuleb aga _puhverserveri host_ ikkagi HTTP-juurdepääsu jaoks konfigureerida.

See protsess _ei_ toeta metamärke (wildcard) kasutavaid domeene.

### DNS-sertifikaat

DNS-i poolt valideeritud sertifikaadi saamiseks peate kasutama DNS-teenusepakkuja pistikprogrammi. Seda DNS-teenusepakkujat kasutatakse teie domeenis ajutiste kirjete loomiseks ja seejärel pärib Let's Encrypt nende kirjete kohta, et veenduda, et olete omanik, ning kui see õnnestub, väljastavad nad teile sertifikaadi.

Selle tüüpi sertifikaadi taotlemiseks ei ole vaja _puhverserveri hosti_ eelnevalt luua. Samuti ei pea teie _puhverserveri host_ olema HTTP-juurdepääsu jaoks konfigureeritud.

See protsess _toetab_ metamärke (wildcard) kasutavaid domeene.

### Kohandatud sertifikaat

Kasutage seda valikut oma SSL-sertifikaadi üleslaadimiseks, mille on väljastanud teie enda sertifitseerimisasutus.
