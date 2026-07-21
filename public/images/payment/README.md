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

## pacred-qr-crop.png — the printable version

    node scripts/crop-payment-qr.mjs

`pacred-qr.png` is the whole K-Shop card (portrait · green background · header ·
card-scheme logos · mascot) and the scannable code is only the middle ~40%. That
reads fine on screen, but printed documents give the QR a small fixed box — a
portrait poster squeezed into it comes out distorted, with the code far too small
for a phone to read. So `pacred-qr-crop.png` holds the code alone (quiet zone
kept) and `buildCompactPaymentQrDataUrl()` serves it to print/PDF surfaces.

**Re-run the script whenever you replace `pacred-qr.png`.** It decodes both files
and refuses to write unless the EMVCo payload is byte-identical — the crop can
only ever remove branding, never change where the money lands.
