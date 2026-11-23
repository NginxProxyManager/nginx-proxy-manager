## Ajuda sobre Certificados

### Certificado HTTP

Um certificado validado por HTTP significa que os servidores do Let's Encrypt
tentarão acessar seus domínios via HTTP (não HTTPS!) e, se conseguirem,
emitirão o seu certificado.

Para este método, é preciso ter um _Proxy Host_ criado para o(s) seu(s) domínio(s),
acessível via HTTP e apontando para esta instalação do Nginx. Depois que o certificado
for emitido, você pode alterar o _Proxy Host_ para também usar esse certificado em conexões
HTTPS. No entanto, o _Proxy Host_ ainda precisará estar configurado para acesso via HTTP
para que o certificado seja renovado.

Este processo _não_ suporta domínios curinga (wildcard).

### Certificado DNS

Um certificado validado por DNS exige o uso de um plugin de Provedor de DNS. Esse
Provedor de DNS será usado para criar registros temporários no seu domínio e, em seguida,
o Let's Encrypt consultará esses registros para confirmar que você é o proprietário e,
se der certo, emitirá o seu certificado.

Não é necessário ter um _Proxy Host_ criado antes de solicitar este tipo de
certificado. Também não é necessário que o seu _Proxy Host_ esteja configurado para acesso via HTTP.

Este processo _suporta_ domínios curinga (wildcard).

### Certificado Personalizado

Use esta opção para enviar o seu próprio Certificado SSL, fornecido pela sua própria
Autoridade Certificadora.
