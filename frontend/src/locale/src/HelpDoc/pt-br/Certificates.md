## Ajuda sobre Certificados

### Certificado HTTP

Um certificado validado por HTTP significa que os servidores da Let's Encrypt tentarão
alcançar seus domínios via HTTP (não HTTPS!) e, se bem-sucedidos, eles
emitirão seu certificado.

Para este método, você deve ter um _Host Proxy_ criado para seu(s) domínio(s) que
seja acessível via HTTP e aponte para esta instalação do Nginx. Após um certificado
ter sido concedido, você pode modificar o _Host Proxy_ para também usar este certificado para conexões HTTPS.
No entanto, o _Host Proxy_ ainda precisará ser configurado para acesso HTTP
para que o certificado seja renovado.

Este processo _não_ suporta domínios curinga (wildcard).

### Certificado DNS

Um certificado validado por DNS requer que você use um plugin de Provedor DNS. Este Provedor
DNS será usado para criar registros temporários em seu domínio e, em seguida, a Let's
Encrypt consultará esses registros para ter certeza de que você é o proprietário e, se bem-sucedido, eles
emitirão seu certificado.

Você não precisa que um _Host Proxy_ seja criado antes de solicitar este tipo de
certificado. Nem precisa ter seu _Host Proxy_ configurado para acesso HTTP.

Este processo _suporta_ domínios curinga (wildcard).

### Certificado Personalizado

Use esta opção para enviar seu próprio Certificado SSL, conforme fornecido por sua própria
Autoridade de Certificação.
