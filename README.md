# Menba

Kendi kaynaklarından (PDF / metin) soru bankası üretip test çözdüren
Expo + Supabase uygulaması.

## Yerel geliştirme

1. `.env.example` dosyasını `.env.local` olarak kopyala ve doldur:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_QUESTION_FUZZY_THRESHOLD` (isteğe bağlı, varsayılan 0.82)
2. `npm install`
3. `npm run android` veya `npm run ios`

Değişkenler eksikse uygulama artık sessizce çalışmaya çalışmıyor; açılışta
"Uygulama yapılandırılmamış" ekranı gösteriyor (bkz. `app/_layout.tsx`).

## Build (EAS)

`.env.local` gitignore'da olduğu için **EAS derlemesine yüklenmez**. Her build
profili `eas.json` içinde bir EAS ortamına bağlı (`development` / `preview` /
`production`); değişkenleri o ortamlara bir kez tanımlaman gerekiyor:

```sh
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value "https://<proje>.supabase.co" --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon-key>" --visibility plaintext
```

Aynısını `production` (ve gerekiyorsa `development`) ortamı için de yap.
Tanımlıları görmek için: `eas env:list --environment preview`.

Bu adım atlanırsa APK açılır ama hiçbir istek çalışmaz.

Derleme komutları:

- Android APK (preview): `npm run build:android:preview`
- iOS internal preview: `npm run build:ios:preview`
- Tüm platformlar (preview): `npm run build:all:preview`

## Supabase

### Migration'lar

`supabase/migrations/` altındaki dosyalar sırayla uygulanmalı:

```sh
supabase db push
```

`0007_question_origin_and_delete_policies.sql` iki şey yapıyor: `questions`
tablosuna `origin` sütunu (kaynak sorusu mu AI üretimi mi) ekliyor ve
`question_logs` / `user_progress` üzerindeki eksik DELETE politikalarını
tanımlıyor.

### Edge Functions

```sh
supabase functions deploy generate-question explain-answer extract-topics extract-source-text extract-questions
```

Gerekli secret: `GEMINI_API_KEY`. İsteğe bağlı model override'ları:
`GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_DOC_MODEL`,
`GEMINI_QUESTION_EXTRACT_MODEL`.

### E-posta bağlantıları (doğrulama / şifre sıfırlama)

Uygulama `menba://` şemasını kullanıyor ve gelen token'ı
`src/hooks/useAuthDeepLink.ts` karşılıyor.

`buildAuthRedirectUrl()` (bkz. `src/hooks/useAuthDeepLink.ts`) şu adresleri
üretiyor:

| Çağrı | Üretilen URL |
|---|---|
| `buildAuthRedirectUrl()` | `menba://` |
| `buildAuthRedirectUrl('reset-password')` | `menba://reset-password` |
| Expo Go'da (dev) | `exp://<ip>:8081/--/reset-password` |

**Path'e baştan eğik çizgi koyma.** `expo-linking`'in `createURL` şablonu
`scheme:` + `/` + `/`(host) + path şeklinde birleşiyor
(`expo-linking/build/createURL.js`), dolayısıyla `'/reset-password'` girdisi
`menba:///reset-password` üretir. Supabase paneli host kısmı boş olan bu
biçimi "not valid" diye reddediyor. `buildAuthRedirectUrl` bu yüzden baştaki
eğik çizgileri kırpıyor.

Supabase panelinde **Authentication → URL Configuration → Redirect URLs**
listesine şunlar eklenmeli:

```
menba://
menba://reset-password
exp://**        (yalnızca Expo Go ile geliştirirken)
```

Eklenmezse Supabase `redirectTo` değerini yok sayıp Site URL'e düşer;
bağlantılar tarayıcıda kalır ve kullanıcı uygulamaya dönemez.
