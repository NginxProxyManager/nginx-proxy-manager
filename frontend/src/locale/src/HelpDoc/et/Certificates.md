## Sertifikaatide abi

### HTTP-sertifikaat

HTTP-valideeritud sertifikaat tähendab, et Let's Encrypti serverid

proovivad teie domeenidega ühendust luua HTTP (mitte HTTPS!) kaudu ja kui see õnnestub,
väljastavad nad teile sertifikaadi.

Selle meetodi jaoks peate oma domeeni(de) jaoks looma _Proxy Host_, millele pääseb ligi HTTP kaudu ja mis osutab sellele Nginxi installile. Pärast sertifikaadi väljastamist saate muuta _Proxy Host_'i, et seda sertifikaati ka HTTPS
ühenduste jaoks kasutada. Sertifikaadi uuendamiseks tuleb aga _Proxy Host_ ikkagi HTTP-juurdepääsu jaoks konfigureerida.

See protsess _ei_ toeta metamärke kasutavaid domeene.

### DNS-sertifikaat

DNS-i poolt valideeritud sertifikaadi saamiseks peate kasutama DNS-pakkuja pistikprogrammi. Seda DNS-teenuse pakkujat kasutatakse teie domeenis ajutiste kirjete loomiseks ja seejärel pärib Let's
Encrypt nende kirjete kohta päringu, et veenduda, et olete omanik, ja kui see õnnestub, väljastavad nad teile sertifikaadi.

Selle tüüpi sertifikaadi taotlemiseks ei ole vaja luua _Proxy Host_'i. Samuti ei pea teie _Proxy Host_ olema HTTP-juurdepääsu jaoks konfigureeritud.

See protsess _toetab_ metamärke kasutavaid domeene.

### Kohandatud sertifikaat

Kasutage seda valikut oma SSL-sertifikaadi üleslaadimiseks, mille on esitanud teie enda sertifitseerimisasutus.