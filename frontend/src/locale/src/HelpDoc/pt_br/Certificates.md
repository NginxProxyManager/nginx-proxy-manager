## Ajuda sobre Certificados

### Certificado HTTP

Um certificado validado por HTTP significa que os servidores do Let's Encrypt irão
tentar acessar seus domínios via HTTP (não HTTPS!) e, se bem-sucedido,
emitirão seu certificado.

Para este método, você precisará ter um _Host Proxy_ criado para seu(s) domínio(s) que
seja acessível via HTTP e apontando para esta instalação do Nginx. Após o certificado
ser concedido, você pode modificar o _Host Proxy_ para também usar este certificado para conexões
HTTPS. No entanto, o _Host Proxy_ ainda precisará estar configurado para acesso HTTP
para que o certificado possa ser renovado.

Este processo _não_ suporta domínios curinga.

### Certificado DNS

Um certificado validado por DNS requer que você use um plugin de Provedor DNS. Este Provedor
DNS será usado para criar registros temporários no seu domínio e então o Let's Encrypt
consultará esses registros para ter certeza de que você é o proprietário e, se bem-sucedido,
emitirão seu certificado.

Você não precisa ter um _Host Proxy_ criado antes de solicitar este tipo de
certificado. Nem precisa ter seu _Host Proxy_ configurado para acesso HTTP.

Este processo _suporta_ domínios curinga.

### Certificado Personalizado

Use esta opção para enviar seu próprio Certificado SSL, conforme fornecido pela sua própria
Autoridade Certificadora.
