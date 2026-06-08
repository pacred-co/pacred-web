# Payment QR asset

Drop the company **K-Shop / Thai-QR-Payment** card image here as:

    public/images/payment/pacred-qr.png

This is the STATIC QR every payment surface shows (lib/promptpay.ts reads it +
serves it as a data-url platform-wide). It is the merchant QR for the corporate
Kasikornbank account:

    บัญชี : 225-2-91144-0 · บจก. แพคเรด (ประเทศไทย) · ธนาคารกสิกรไทย

Customers scan it, **type the amount themselves**, transfer, and attach the slip
(staff verify). Until this file exists, the payment screens degrade gracefully to
showing the bank-account text only (no broken image).
