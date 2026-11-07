# Domain knowledge (Turkey, motorcycles, KVKK)

### License classes (2026-11-08)
- A1 (≤125 cc), A2, A. **B holders** may ride ≤125 cc only after 2 years with B + 6 h riding lessons + practical exam
  (Karayolları Trafik Yönetmeliği art. 85 change, Resmî Gazete 10 Feb 2024); not for commercial use. A 250 cc
  extension was only discussed in 2026, not law. Form option: `b` = "B (125 cc yetkili)".

### Istanbul districts (2026-11-07)
- 39 districts: 25 European, 14 Asian; Adalar counts as Asian. List + side mapping in `src/lib/istanbul-districts.ts`.

### Turkish phone habits (2026-11-08)
- People type `0546…` (trunk 0) or `90546…`; store E.164 `+905461234567`. WhatsApp link: `https://wa.me/<digits>`.

### KVKK essentials used so far (not legal advice) (2026-11-07)
- Privacy notice (aydınlatma metni, art. 10) required; consents separate and never pre-ticked; photo sharing needs
  explicit consent (açık rıza) and must be revocable; blood type = special-category health data.
- Data abroad (Supabase/Vercel in Frankfurt) = cross-border transfer (art. 9, amended 2024): standard contracts +
  notification to the Authority within 5 business days.
- Avoid third-party requests that leak visitor IPs without need (e.g. phone-input flag CDN) and non-essential
  cookies (UTM attribution is passed via URL, no cookie).
- Store the privacy-notice version with each consent (`privacy_notice_version`).
