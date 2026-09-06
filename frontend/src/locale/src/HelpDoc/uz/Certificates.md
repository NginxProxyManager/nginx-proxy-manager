## Sertifikatlar bo'yicha yordam

### HTTP sertifikati

HTTP orqali tasdiqlangan sertifikat shuni anglatadiki, Let's Encrypt serverlari sizning domenlaringizga HTTP (HTTPS emas!) orqali ulanishga harakat qiladi va muvaffaqiyatli bo'lsa, sertifikat beradi.

Ushbu usul uchun sizning domen(lar)ingiz uchun HTTP orqali ochiq bo'lgan va ushbu Nginx o'rnatmasiga yo'naltirilgan _Proxy Host_ yaratilgan bo'lishi kerak. Sertifikat berilgandan so'ng, siz ushbu sertifikatdan HTTPS ulanishlari uchun ham foydalanish uchun _Proxy Host_ni o'zgartirishingiz mumkin. Biroq, sertifikat yangilanishi uchun _Proxy Host_ hali ham HTTP kirish uchun sozlangan bo'lishi kerak.

Ushbu jarayon umumiy (wildcard) domenlarni _qo'llab-quvvatlamaydi_.

### DNS sertifikati

DNS orqali tasdiqlangan sertifikat sizdan DNS provayder plaginidan foydalanishni talab qiladi. Ushbu DNS provayderi domeningizda vaqtinchalik yozuvlar yaratish uchun ishlatiladi va keyin Let's Encrypt sizning egalik huquqingizga ishonch hosil qilish uchun ushbu yozuvlarni tekshiradi va muvaffaqiyatli bo'lsa, sertifikat beradi.

Ushbu turdagi sertifikatni so'rashdan oldin _Proxy Host_ yaratishingiz shart emas. Shuningdek, _Proxy Host_ingiz HTTP kirish uchun sozlangan bo'lishi ham shart emas.

Ushbu jarayon umumiy (wildcard) domenlarni _qo'llab-quvvatlaydi_.

### Maxsus sertifikat (Custom Certificate)

O'zingizning sertifikat markazingiz (Certificate Authority) tomonidan taqdim etilgan shaxsiy SSL sertifikatingizni yuklash uchun ushbu parametrdan foydalaning.
