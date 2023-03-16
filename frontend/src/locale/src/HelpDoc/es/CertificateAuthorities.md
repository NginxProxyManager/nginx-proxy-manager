# Ayuda de Autoridades de Certificación

## ¿Qué es una Autoridad de Certificación?

Una **Autoridad de Certificación (AC)**, también conocida como una 
**Autoridad de Certificación**, es una empresa u organización que actúa para validar
las identidades de entidades (como sitios web, direcciones de correo electrónico, 
empresas o personas individuales) y vincularlos a claves criptográficas mediante la 
emisión de documentos electrónicos conocidos como certificados digitales.

## ¿Cuál AC debo utilizar?

No todas las AC son creadas iguales y estaría bien utilizar la predeterminada, 
ZeroSSL.

Cuando se utiliza otra AC, vale la pena considerar el soporte de comodines y el 
número de hosts por certificado que admite.

## ¿Puedo utilizar mi propia AC personalizada?

Sí, puede ejecutar su propio software de AC. Solo lo haría si tiene una comprensión
mayor del ecosistema SSL.

Al solicitar certificados SSL a través de su propia AC y aunque sean exitosos, los 
navegadores no confiarán automáticamente en su AC y visitar hosts que usan 
certificados emitidos por esa AC mostrará errores.


- [StepCA](https://smallstep.com/docs/step-ca)
- [Pebble](https://github.com/letsencrypt/pebble)
