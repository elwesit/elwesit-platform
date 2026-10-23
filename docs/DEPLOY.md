# النشر على خادم

> لم يُنشر شيء للإنتاج. هذه خطوات لك أو لمن تكلّفه، وتُنفَّذ بعد موافقتك واختيارك للخادم والنطاق. لا تتطلب المنظومة أي خدمة مدفوعة غير الخادم والنطاق.

## المتطلبات

- خادم Linux (Ubuntu 24.04 مثلاً) بذاكرة 1 GB على الأقل، وNode.js 22.
- نطاق يشير إلى الخادم.
- Caddy (يصدر شهادة HTTPS مجانية تلقائياً). يصلح Nginx مع Certbot أيضاً.

## التثبيت

```bash
sudo useradd --system --create-home --home-dir /opt/wasit wasit
sudo mkdir -p /var/lib/wasit && sudo chown wasit: /var/lib/wasit && sudo chmod 700 /var/lib/wasit
sudo -u wasit git clone <رابط المستودع> /opt/wasit/app
cd /opt/wasit/app
sudo -u wasit npm ci
sudo -u wasit npm run build
sudo -u wasit cp .env.example .env    # عدّل BASE_URL وغيره
sudo chmod 600 .env
# حساب المدير: كلمة المرور تُكتب بشكل مخفي (لا تضعها في سطر الأوامر)
sudo -u wasit env $(grep -v '^#' .env | xargs) node server/cli.js create-admin --email you@example.mr --name "اسمك"
```

## الخدمة (systemd)

`/etc/systemd/system/wasit.service`:

```ini
[Unit]
Description=Wasit real estate
After=network.target

[Service]
User=wasit
WorkingDirectory=/opt/wasit/app
EnvironmentFile=/opt/wasit/app/.env
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/wasit
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now wasit
```

## Caddy (HTTPS)

`/etc/caddy/Caddyfile`:

```
example.mr, www.example.mr {
  encode zstd gzip
  request_body { max_size 30MB }
  reverse_proxy 127.0.0.1:8080
}
```

مع `TRUST_PROXY=1` و`SECURE_COOKIES=1` في `.env`.

## المتغيرات

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `WASIT_DATA_DIR` | `./data` | مجلد قواعد البيانات والملفات (خارج مجلد الشيفرة) |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | اجعل HOST `127.0.0.1` خلف Caddy |
| `BASE_URL` | فارغ | الرابط العام، لروابط المشاركة ومعاينات واتساب و`sitemap.xml` |
| `TRUST_PROXY` | `0` | `1` خلف وكيل HTTPS |
| `SECURE_COOKIES` | `1` في الإنتاج | كعكات `Secure` |
| `SESSION_DAYS` | `30` | مدة الجلسة |
| `MAX_UPLOAD_MB` | `25` | أقصى حجم للملف المرفوع |
| `WA_*` | فارغة | انظر WHATSAPP.md. فارغة = التكامل مطفأ |

## بعد التشغيل

1. ادخل `/admin/` ← الإعدادات ← «الموقع والتواصل»: الاسم، أرقام الاتصال وواتساب، المدينة، ونص التعريف.
2. ثبّت مساحة العمل على الهاتف من المتصفح: «إضافة إلى الشاشة الرئيسية».
3. أضف الأحياء التي تعمل فيها (الإعدادات ← الأحياء) واربط كلاً منها بمقاطعته **إن كنت متأكداً**.
4. فعّل النسخ الاحتياطي اليومي (BACKUP.md).

## التحديث

```bash
cd /opt/wasit/app && sudo -u wasit npm run backup
sudo -u wasit git pull && sudo -u wasit npm ci && sudo -u wasit npm run build
sudo systemctl restart wasit
```

تحديثات المخطط تُطبَّق تلقائياً عند التشغيل، وهي إضافية فقط ولا تحذف بيانات.

## الخرائط

البلاطات الافتراضية من OpenStreetMap مع الإسناد المطلوب. سياسة OSM تسمح بالاستعمال الخفيف. إذا كبرت الزيارات فغيّر `map_tiles_url` في الإعدادات إلى مزود تملك حق استعماله. لا تُنسخ بيانات خرائط من مواقع أخرى.
