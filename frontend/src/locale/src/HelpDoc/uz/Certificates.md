## Sertifikatlar Yordami

### HTTP Sertifikati

HTTP tasdiqlangan sertifikat, Let's Encrypt serverlari sizning domeningizga HTTP (HTTPS emas!) orqali kirishga harakat qilishini va muvaffaqiyatli boʻlsa, ular sizning sertifikatingizni chiqarishini anglatadi.

Ushbu usul uchun siz oʻzingizning domen(lar)ingiz uchun HTTP bilan kirish mumkin boʻlgan va ushbu Nginx oʻrnatilishiga ishora qiluvchi _Proksi Xost_ yaratgan boʻlishingiz kerak. Sertifikat berilgandan soʻng, siz _Proksi Xost_ni HTTPS ulanishlari uchun ham ushbu sertifikatdan foydalanish uchun oʻzgartirishingiz mumkin. Biroq, sertifikatni yangilash uchun _Proksi Xost_ hali ham HTTP kirish uchun sozlangan boʻlishi kerak.

Ushbu jarayon joker belgili domenlarni qoʻllab-quvvatlamaydi.

### DNS Sertifikati

DNS tasdiqlangan sertifikat sizdan DNS Provayder plaginidan foydalanishni talab qiladi. Ushbu DNS Provayder sizning domeningizda vaqtinchalik yozuvlarni yaratish uchun ishlatiladi va keyin Let's Encrypt sizning egasi ekanligingizga ishonch hosil qilish uchun ushbu yozuvlarni soʻraydi va muvaffaqiyatli boʻlsa, ular sizning sertifikatingizni chiqaradi.

Ushbu turdagi sertifikatni soʻrashdan oldin _Proksi Xost_ yaratishingiz shart emas. Shuningdek, _Proksi Xost_ingizni HTTP kirish uchun sozlash shart emas.

Ushbu jarayon joker belgili domenlarni qoʻllab-quvvatlaydi.

### Maxsus Sertifikat

Oʻzingizning Sertifikat Idorangiz tomonidan taqdim etilgan oʻz SSL Sertifikatingizni yuklash uchun ushbu variantdan foydalaning.
