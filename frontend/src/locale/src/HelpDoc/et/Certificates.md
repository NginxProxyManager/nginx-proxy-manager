## Sertifikaatide abi

### HTTP-sertifikaat

HTTP-ga kinnitatud sertifikaadi puhul üritavad Let's Encrypti serverid su domeenidele ligi saada HTTP kaudu (mitte HTTPS!) ja õnnestumise korral väljastavad sertifikaadi.

Selleks peab olema loodud puhverserver, mis on HTTP kaudu kättesaadav ja osutab sellele Nginxile. Kui sertifikaat on käes, võid puhverserveri panna HTTPS-i ka kasutama. Uuendamiseks peab HTTP-ligipääs siiski alles jääma.

Metamärgid (wildcard) selle meetodiga ei tööta.

### DNS-sertifikaat

DNS-iga kinnitatud sertifikaat vajab DNS-teenuse pakkuja pluginat. Plugin loob domeenile ajutised kirjed, Let's Encrypt kontrollib need üle ja õnnestumise korral väljastab sertifikaadi.

Puhverserverit enne taotlust looma ei pea. HTTP-ligipääsu ka ei nõuta.

See meetod toetab metamärke.

### Kohandatud sertifikaat

Siia saad üles laadida oma SSL-sertifikaadi, mille on väljastanud sinu sertifitseerija.
