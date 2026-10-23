// مسارات عمل كاملة عبر المتصفح (Chromium). تُشغَّل بمقاس حاسوب ومقاس جوال (محاكاة Pixel 7).
import { test, expect } from '@playwright/test';
import sharp from 'sharp';

const ADMIN = { email: process.env.E2E_EMAIL || 'admin@e2e.test', password: process.env.E2E_PASSWORD || 'E2e-pass-123456' };
const rnd = () => Math.random().toString(36).slice(2, 7);

const AUTH = 'tests/e2e/.auth.json';
// زائر حقيقي: سياق جديد بلا أي جلسة (وإلا ورث جلسة المدير من الإعدادات)
const ANON = { locale: 'ar', storageState: { cookies: [], origins: [] } };
// الجلسة محفوظة من auth.setup.js؛ هذا يفتح مساحة العمل فقط
async function login(page) {
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'ما يحتاج إلى تصرف اليوم' })).toBeVisible();
}
async function loginForm(page) {
  await page.goto('/admin/');
  await page.getByLabel('البريد الإلكتروني').fill(ADMIN.email);
  await page.getByLabel('كلمة المرور').fill(ADMIN.password);
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page.getByRole('heading', { name: 'ما يحتاج إلى تصرف اليوم' })).toBeVisible();
}
const api = (page) => ({
  get: async (url) => (await page.request.get('/api/admin' + url)).json(),
  post: async (url, data) => (await page.request.post('/api/admin' + url, { data, headers: { 'x-wasit': '1' } })).json(),
});
async function waitSaved(page) { await expect(page.locator('.sync-label').first()).toHaveText('محفوظ', { timeout: 15000 }); }

test('زائر يرسل طلباً ← يظهر في الوارد واليوم ← يُحوَّل إلى عميل وطلب', async ({ page, browser }) => {
  const name = 'زائر ' + rnd();
  const visitor = await browser.newContext(ANON);
  const v = await visitor.newPage();
  await v.goto('/request');
  await v.getByLabel('إيجار').check();
  await v.getByLabel('نوع العقار').selectOption('apartment');
  await v.getByLabel('المكان المطلوب').fill('تفرغ زينة');
  await v.getByLabel('الميزانية التقريبية').fill('150 ألف جديدة شهريا');
  await v.getByLabel('الاسم').fill(name);
  await v.getByLabel(/رقم الهاتف/).fill('46 12 34 56');
  await v.getByRole('button', { name: 'أرسل طلبي' }).click();
  await expect(v.locator('.form-status')).toContainText('وصل طلبك');
  await visitor.close();

  await login(page);
  await expect(page.locator('#main')).toContainText(name);
  await page.goto('/admin/#/inbox');
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await page.getByRole('button', { name: 'حوّل إلى عميل + طلب' }).click();
  const sheet = page.locator('.sheet');
  await expect(sheet.getByRole('radio', { name: 'إيجار' })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'حوّل', exact: true }).click();
  await expect(page).toHaveURL(/#\/requests\//);
  await expect(page.locator('body')).toContainText(name);
  await expect(page.locator('body')).toContainText('تفرغ زينة');
});

test('إعادة إرسال نموذج بعد انقطاع لا تكرر الطلب', async ({ page, browser }) => {
  const name = 'مكرر ' + rnd();
  const visitor = await browser.newContext(ANON);
  const v = await visitor.newPage();
  await v.goto('/contact');
  await v.getByLabel('الاسم').fill(name);
  await v.getByLabel(/رقم الهاتف/).fill('22334455');
  await v.getByLabel(/رسالتك/).fill('أريد الاستفسار');
  // الطلب يصل للخادم لكن الرد يضيع
  await v.route('**/api/public/inbox', async (route) => { await route.fetch(); await route.abort('connectionreset'); });
  await v.getByRole('button', { name: 'أرسل', exact: true }).click();
  await expect(v.locator('.form-status')).toHaveClass(/err/);
  await v.unroute('**/api/public/inbox');
  // المعلومات باقية بعد إعادة التحميل أيضاً
  await v.reload();
  await expect(v.getByLabel('الاسم')).toHaveValue(name);
  await v.getByRole('button', { name: 'أرسل', exact: true }).click();
  await expect(v.locator('.form-status')).toContainText('وصل طلبك');
  await visitor.close();
  await login(page);
  const { data: tables } = await api(page).get('/sync?since=');
  expect(tables.inbox.filter((m) => m.name === name)).toHaveLength(1);
});

test('عرض جديد ← نشر ← يراه الزائر بالفلاتر والخريطة ← سحب ← يختفي', async ({ page, browser }) => {
  const lot = String(1000 + Math.floor(Math.random() * 8000));
  await login(page);
  await page.goto('/admin/#/properties/new');
  await page.getByRole('radio', { name: 'بيع' }).click();
  await page.getByRole('button', { name: 'قطعة أرض' }).click();
  await page.getByLabel('الولاية').selectOption({ label: 'نواكشوط الشمالية' });
  await page.getByLabel('المقاطعة').selectOption({ label: 'توجنين' });
  await page.getByLabel('رقم القطعة (النمرة)').fill(lot);
  await page.getByLabel('المبلغ بالأرقام').fill('3000000');
  await page.getByRole('radio', { name: 'أوقية جديدة' }).click();
  await page.getByLabel('ملاحظات خاصة (لا تُنشر أبداً)').fill('سر-داخلي-' + lot);
  await page.getByRole('button', { name: 'حفظ العرض' }).click();
  await expect(page).toHaveURL(/#\/properties\/[0-9a-f-]{36}/);
  await waitSaved(page);
  await expect(page.locator('.pub-status')).toContainText('مسودة');

  // البحث برقم القطعة يجده
  await page.goto('/admin/#/search?q=' + lot);
  await expect(page.locator('body')).toContainText('قطعة أرض');
  await page.goBack();

  await page.getByRole('button', { name: 'انشر على الموقع' }).click();
  await expect(page.getByRole('button', { name: 'إلغاء النشر' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.pub-status')).toContainText('منشور');
  const { data: tables } = await api(page).get('/sync?since=');
  const prop = tables.properties.find((p) => p.lot_number === lot);
  expect(prop.published).toBeTruthy();

  // أرقام التواصل تُضبط مركزياً من الإعدادات
  await page.request.put('/api/admin/settings', { data: { contact_phone: '22334455', contact_whatsapp: '22334455' }, headers: { 'x-wasit': '1' } });
  const visitor = await browser.newContext(ANON);
  const v = await visitor.newPage();
  await v.goto('/?deal=sale&type=land');
  await expect(v.locator(`a[href="/p/${prop.ref}"]`).first()).toBeVisible();
  await v.goto('/?deal=rent');
  await expect(v.locator(`a[href="/p/${prop.ref}"]`)).toHaveCount(0);
  await v.goto('/p/' + prop.ref);
  await expect(v.locator('body')).toContainText('3 مليون');
  await expect(v.locator('body')).not.toContainText('سر-داخلي');
  await expect(v.locator('body')).not.toContainText(lot); // رقم القطعة مخفي افتراضياً
  const wa = v.locator('a[href*="wa.me"][href*="text="]').first();
  await expect(wa).toHaveAttribute('href', new RegExp(prop.ref));
  // عرض الخريطة
  await v.goto('/?view=map');
  await expect(v.getByRole('tab', { name: 'خريطة' })).toHaveAttribute('aria-selected', 'true');
  await expect(v.locator('.leaflet-container')).toBeVisible({ timeout: 15000 });
  await expect(v.locator('.leaflet-container')).toContainText(/OpenStreetMap/);

  await page.getByRole('button', { name: 'إلغاء النشر' }).click();
  await expect(page.getByRole('button', { name: 'انشر على الموقع' })).toBeVisible({ timeout: 15000 });
  const gone = await v.goto('/p/' + prop.ref);
  expect(gone.status()).toBe(404);
  await visitor.close();
});

test('الالتقاط السريع: لصق رسالة واتساب ← تأكيد العملة إلزامي ← حفظ عرض مع النص الأصلي', async ({ page }) => {
  const lot = String(10 + Math.floor(Math.random() * 80)) + rnd().slice(0, 2);
  await login(page);
  await page.goto('/admin/#/capture');
  const text = `عندي قطعة أرض نمرة ${lot} مخطط 3 قطاع 7 في توجنين مساحتها 300 متر بـ 3 مليون، المالك سيدي 36123456`;
  await page.getByLabel('النص').fill(text);
  await expect(page.getByRole('heading', { name: 'راجع قبل الحفظ' })).toBeVisible();
  const save = page.locator('.form-actions').getByRole('button', { name: 'حفظ' });
  await expect(save).toBeDisabled(); // العملة غير محددة
  const cur = page.locator('.confirm-box', { hasText: 'العملة غير محددة' });
  await expect(cur).toBeVisible();
  await cur.getByRole('button', { name: /^3 مليون أوقية جديدة/ }).click();
  const deal = page.locator('.confirm-box', { hasText: 'نوع العملية' });
  if (await deal.count()) await deal.getByRole('button').first().click();
  await expect(save).toBeEnabled();
  await expect(page.getByLabel('رقم القطعة')).toHaveValue(lot);
  await expect(page.getByLabel('المساحة بالمتر المربع')).toHaveValue('300');
  await save.click();
  await expect(page).toHaveURL(/#\/properties\//, { timeout: 15000 });
  await waitSaved(page);
  const { data: tables } = await api(page).get('/sync?since=');
  const p = tables.properties.find((x) => x.lot_number === lot);
  expect(p.price_currency).toBe('MRU');
  expect(p.price_amount).toBe(3000000);
  expect(p.area_m2).toBe(300);
  expect(tables.captures.some((c) => c.raw_text === text)).toBeTruthy();
});

test('بلا اتصال: الإدخال يُحفظ محلياً بوضوح ويُرسل عند عودة الاتصال دون تكرار', async ({ page, context }) => {
  const name = 'بلا اتصال ' + rnd();
  await login(page);
  await page.goto('/admin/#/people');
  await context.setOffline(true);
  await expect(page.locator('.sync-label').first()).toContainText('بلا اتصال');
  await page.getByRole('button', { name: 'شخص جديد' }).click();
  const sheet = page.locator('.sheet');
  await sheet.getByLabel('الاسم').fill(name);
  await sheet.getByLabel('الهاتف').fill('22 11 33 44');
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.locator('.sync-label').first()).toContainText('بانتظار الإرسال');
  await expect(page.locator('body')).toContainText(name);
  await context.setOffline(false);
  await waitSaved(page);
  const { data: tables } = await api(page).get('/sync?since=');
  expect(tables.people.filter((p) => p.name === name)).toHaveLength(1);
});

test('تعديل من الجوال ثم من الحاسوب على الحقل نفسه ← يظهر التعارض للمراجعة', async ({ page, browser }) => {
  await login(page);
  const r = await api(page).post('/e/requests', { id: crypto.randomUUID(), deal: 'sale', notes: 'أصل' });
  const id = r.row.id;
  // «الحاسوب» يفتح الطلب ويبقى بلا مزامنة (بلا اتصال) أثناء تعديل «الجوال»
  await page.goto('/admin/#/requests/' + id);
  await expect(page.locator('body')).toContainText('أصل');
  await page.context().setOffline(true);
  const phoneCtx = await browser.newContext({ locale: 'ar', storageState: AUTH });
  const ph = await phoneCtx.newPage();
  await login(ph);
  const cur = (await api(ph).get('/e/requests/' + id)).row;
  await ph.request.patch('/api/admin/e/requests/' + id, { data: { base_version: cur.version, patch: { notes: 'من الجوال' } }, headers: { 'x-wasit': '1' } });
  await phoneCtx.close();
  // تعديل الملاحظات من الحاسوب
  await page.getByRole('link', { name: 'تعديل', exact: true }).click();
  await page.getByLabel('ملاحظات خاصة').fill('من الحاسوب');
  await page.getByRole('button', { name: 'حفظ' }).click();
  await page.context().setOffline(false);
  await expect(page.getByText(/تعارض|تغيّر|تغير على جهاز آخر/).first()).toBeVisible({ timeout: 15000 });
});

test('رفع صورة بموقع GPS ← النسخة العامة بلا بيانات EXIF', async ({ page }) => {
  await login(page);
  const lot = 'G' + rnd();
  const owner = (await api(page).post('/e/people', { id: crypto.randomUUID(), name: 'مالك سري ' + lot, notes: 'ملاحظة-عميل-سرية' })).row;
  await api(page).post('/e/phones', { id: crypto.randomUUID(), person_id: owner.id, raw: '46998877', whatsapp: 1 });
  const { row } = await api(page).post('/e/properties', { id: crypto.randomUUID(), deal: 'rent', type: 'house', wilaya_code: 'NKW', moughataa_code: 'TVZ', lot_number: lot, owner_person_id: owner.id, internal_notes: 'ملاحظة-داخلية-' + lot });
  const jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#c96' } }).jpeg().withExif({ IFD0: { Make: 'TestCam', Copyright: 'secret-owner' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '18/1 5/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '15/1 58/1 0/1' } }).toBuffer();
  expect((await sharp(jpeg).metadata()).exif).toBeTruthy();
  await page.goto('/admin/#/properties/' + row.id);
  await page.locator('input[type=file][accept*="image"]').first().setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.locator('.photos img, .photo img').first()).toBeVisible({ timeout: 15000 });
  await waitSaved(page);
  await page.getByRole('button', { name: 'انشر على الموقع' }).click();
  await expect(page.getByRole('button', { name: 'إلغاء النشر' })).toBeVisible({ timeout: 15000 });
  const listing = await (await page.request.get('/p/' + row.ref)).text();
  // بيانات المالك والملاحظات الخاصة لا تصل إلى الصفحة العامة ولا إلى بحث الزوار
  for (const secret of ['46998877', 'مالك سري', 'ملاحظة-عميل-سرية', 'ملاحظة-داخلية-']) expect(listing).not.toContain(secret);
  const home = await (await page.request.get('/?q=' + encodeURIComponent('مالك سري'))).text();
  expect(home).not.toContain(row.ref);
  const src = listing.match(/\/media\/[^"' )]+\.webp/)[0];
  const img = await (await page.request.get(src)).body();
  const meta = await sharp(img).metadata();
  expect(meta.exif).toBeFalsy();
  expect(img.includes(Buffer.from('secret-owner'))).toBeFalsy();
  await api(page).post(`/properties/${row.id}/unpublish`, {});
  expect((await page.request.get(src)).status()).toBe(404);
});

test('فرصة ← معاينة ← تمت ← عمولة لا تُحسب محصّلة حتى تسجيل الدفعة', async ({ page }) => {
  await login(page);
  const A = api(page);
  const person = (await A.post('/e/people', { id: crypto.randomUUID(), name: 'مشتري ' + rnd(), roles: ['buyer'] })).row;
  const deal = (await A.post('/e/deals', { id: crypto.randomUUID(), title: 'صفقة ' + rnd(), client_person_id: person.id, stage: 'interest' })).row;
  await page.goto('/admin/#/deals/' + deal.id);
  await page.locator('.stepper').getByRole('button', { name: 'تمت' }).click();
  await expect(page.locator('.stepper li.on')).toHaveText('تمت');
  await waitSaved(page);
  await page.getByRole('button', { name: 'اتفاق عمولة' }).click();
  const sheet = page.locator('.sheet');
  await sheet.getByLabel('المبلغ المستحق').fill('200000');
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await waitSaved(page);
  await expect(page.locator('body')).toContainText(/متبق/);
  const { data: tables } = await A.get('/sync?since=');
  const c = tables.commissions.find((x) => x.deal_id === deal.id);
  expect(c).toBeTruthy();
  expect(tables.commission_payments.filter((p) => p.commission_id === c.id)).toHaveLength(0);
});

test('الصلاحيات: الزائر لا يصل إلى الإدارة ولا إلى الملفات الخاصة، والخروج يُنهي الجلسة', async ({ browser }) => {
  const ctx = await browser.newContext(ANON);
  const page = await ctx.newPage();
  expect((await page.request.get('/api/admin/sync')).status()).toBe(401);
  expect((await page.request.get('/api/admin/export.xlsx')).status()).toBe(401);
  await page.goto('/admin/');
  await expect(page.getByRole('button', { name: 'دخول' })).toBeVisible();
  await loginForm(page);
  expect((await page.request.get('/api/admin/sync')).status()).toBe(200);
  // CSRF: طلب كتابة دون الرأس
  expect((await page.request.post('/api/admin/e/people', { data: { name: 'x' } })).status()).toBe(403);
  await page.goto('/admin/#/settings');
  await page.getByRole('radio', { name: 'الحساب' }).click();
  await page.getByRole('button', { name: 'خروج من هذا الجهاز' }).click();
  await expect(page.getByRole('button', { name: 'دخول' })).toBeVisible();
  expect((await page.request.get('/api/admin/sync')).status()).toBe(401);
  await ctx.close();
});

test('معاينة اليوم ← تظهر في «اليوم» ← تسجيل النتيجة ← متابعة تالية', async ({ page }) => {
  await login(page);
  const place = 'أمام المسجد ' + rnd();
  await page.goto('/admin/#/appointments/new');
  // نواكشوط = UTC+0؛ بعد ساعتين من الآن (أو 23:30 إن تجاوزنا اليوم)
  const t = new Date(Date.now() + 2 * 3600000);
  const local = t.getUTCDate() === new Date().getUTCDate() ? t.toISOString().slice(0, 16) : new Date().toISOString().slice(0, 11) + '23:30';
  await page.getByLabel('التاريخ والوقت (توقيت نواكشوط)').fill(local);
  await page.getByLabel('المكان').fill(place);
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect(page).toHaveURL(/#\/appointments\/[0-9a-f-]{36}/);
  await waitSaved(page);
  await page.goto('/admin/#/today');
  await expect(page.locator('#main')).toContainText('موعد اليوم');
  await page.goBack();
  await page.getByRole('button', { name: 'سجّل النتيجة' }).click();
  const sheet = page.locator('.sheet');
  await sheet.getByLabel('النتيجة / الانطباع').fill('أعجبه الموقع، يريد تخفيضاً');
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  // تُقترح خطوة تالية مباشرة
  await expect(page.locator('.sheet').getByLabel('ماذا ستفعل؟')).toHaveValue(/متابعة بعد/);
  await page.locator('.sheet').getByRole('button', { name: 'حفظ' }).click();
  await waitSaved(page);
  const { data: tables } = await api(page).get('/sync?since=');
  const a = tables.appointments.find((x) => x.place === place);
  expect(a.status).toBe('done');
  expect(tables.activities.some((x) => x.body.includes('أعجبه الموقع'))).toBeTruthy();
});

test('الخانات تتبع نوع العقار والعملية، وغير المناسب يُفرَّغ ولا يمنع الحفظ', async ({ page }) => {
  await login(page);
  await page.goto('/admin/#/properties/new');
  const rooms = page.getByLabel('عدد الغرف');
  const lotF = page.getByLabel('رقم القطعة (النمرة)');
  // بلا نوع: الخانات العامة فقط
  await expect(page.getByLabel('المساحة بالمتر المربع')).toBeVisible();
  await expect(page.getByLabel('المساحة من')).toHaveCount(0);
  await expect(rooms).toHaveCount(0);
  // دار للبيع: الغرف والنمرة
  await page.getByRole('radio', { name: 'بيع' }).click();
  await page.getByRole('button', { name: 'دار', exact: true }).click();
  await expect(rooms).toBeVisible();
  await expect(lotF).toBeVisible();
  await rooms.fill('4');
  await lotF.fill('77');
  await page.getByText('تفاصيل إضافية').click();
  await expect(page.getByLabel('الحمامات')).toBeVisible();
  await expect(page.getByRole('button', { name: 'مفروشة' })).toBeVisible();
  // تحويلها إلى أرض: تختفي بيانات الدار وتُفرَّغ
  await page.getByRole('button', { name: 'قطعة أرض' }).click();
  await expect(rooms).toHaveCount(0);
  await expect(page.getByLabel('الحمامات')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'مفروشة' })).toHaveCount(0);
  await expect(lotF).toHaveValue('77');
  // شقة للإيجار: لا نمرة، والسعر شهري
  await page.getByRole('button', { name: 'شقة' }).click();
  await page.getByRole('radio', { name: 'إيجار' }).click();
  await expect(lotF).toHaveCount(0);
  await expect(rooms).toBeVisible();
  await expect(rooms).toHaveValue('');
  await expect(page.locator('legend', { hasText: 'شهري' })).toBeVisible();
  // الولاية تحصر المقاطعات فيها
  await page.getByLabel('الولاية').selectOption({ label: 'نواكشوط الغربية' });
  const opts = await page.getByLabel('المقاطعة').locator('option').allTextContents();
  expect(opts).toContain('تفرغ زينة');
  expect(opts).not.toContain('توجنين');
  await page.getByRole('button', { name: 'حفظ العرض' }).click();
  await expect(page).toHaveURL(/#\/properties\/[0-9a-f-]{36}/);
  await waitSaved(page);
  const id = page.url().split('/').pop();
  const row = (await api(page).get('/e/properties/' + id)).row;
  expect(row.type).toBe('apartment');
  expect(row.bedrooms).toBeNull();
  expect(row.lot_number || '').toBe('');
  expect(row.price_basis).toBe('monthly');

  // الطلب: مساحة واحدة، والغرف للأنواع السكنية فقط
  await page.goto('/admin/#/requests/new');
  await expect(page.getByLabel('عدد الغرف (على الأقل)')).toHaveCount(0);
  await page.getByRole('button', { name: 'فيلا' }).click();
  await page.getByLabel('عدد الغرف (على الأقل)').fill('5');
  await page.getByLabel('المساحة بالمتر المربع').fill('400');
  await page.getByRole('button', { name: 'فيلا' }).click();
  await page.getByRole('button', { name: 'قطعة أرض' }).click();
  await expect(page.getByLabel('عدد الغرف (على الأقل)')).toHaveCount(0);
  await page.getByRole('button', { name: 'حفظ الطلب' }).click();
  await expect(page).toHaveURL(/#\/requests\/[0-9a-f-]{36}/);
  await waitSaved(page);
  const rid = page.url().split('/').pop();
  const req = (await api(page).get('/e/requests/' + rid)).row;
  expect(req.area_min).toBe(400);
  expect(req.area_max).toBe(400);
  expect(req.bedrooms_min).toBeNull();
  expect(req.types).toEqual(['land']);
});

test('حفظ عرض فارغ تماماً مسموح ويبقى مسودة', async ({ page }) => {
  await login(page);
  await page.goto('/admin/#/properties/new');
  await page.getByRole('button', { name: 'حفظ العرض' }).click();
  await expect(page).toHaveURL(/#\/properties\/[0-9a-f-]{36}/);
  await expect(page.locator('.pub-status')).toContainText('مسودة');
  await expect(page.getByRole('link', { name: 'أكمل البيانات' })).toBeVisible();
});
