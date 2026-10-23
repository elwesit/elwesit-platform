// تكامل WhatsApp Business Cloud API — اختياري ومستقل. غيابه لا يعطل أي جزء آخر.
// لا يرسل هذا الملف أي رسالة. يستقبل الرسائل الواردة عبر webhook ويضعها في «الوارد».
import crypto from 'node:crypto';
import { config } from './config.js';
import { db, now, uid } from './db.js';
import { normalizePhone } from '../shared/phone.js';

const wa = () => config.whatsapp;
export const isConfigured = () => !!(wa().token && wa().phoneNumberId && wa().appSecret && wa().verifyToken);
// الاستقبال يحتاج فقط سرّ التطبيق (للتوقيع) ورمز التحقق؛ بدونهما يبقى المسار مغلقاً
const canReceive = () => !!(wa().appSecret && wa().verifyToken);

let lastCheck = { at: 0, result: null };

// «متصل» لا يظهر إلا بعد نجاح طلب فعلي إلى Graph API
export async function status({ refresh = false } = {}) {
  if (!isConfigured()) return { state: 'not_configured', label: 'غير مهيأ', detail: 'لم تُضبط متغيرات WA_TOKEN وWA_PHONE_NUMBER_ID وWA_APP_SECRET وWA_VERIFY_TOKEN على الخادم.' };
  if (!refresh && lastCheck.result && Date.now() - lastCheck.at < 5 * 60000) return lastCheck.result;
  let result;
  try {
    const r = await fetch(`https://graph.facebook.com/${wa().graphVersion}/${wa().phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,platform_type,code_verification_status`, { headers: { Authorization: `Bearer ${wa().token}` }, signal: AbortSignal.timeout(10000) });
    const body = await r.json().catch(() => ({}));
    if (r.ok && body.display_phone_number) result = { state: 'connected', label: 'متصل', detail: `${body.verified_name || ''} ${body.display_phone_number}`.trim(), info: { platform: body.platform_type, quality: body.quality_rating } };
    else result = { state: 'error', label: 'تعذر التحقق', detail: body?.error?.message || `HTTP ${r.status}` };
  } catch (e) {
    result = { state: 'error', label: 'تعذر الاتصال بخدمة واتساب', detail: String(e.message || e) };
  }
  lastCheck = { at: Date.now(), result };
  return result;
}

export function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'], token = req.query['hub.verify_token'], challenge = req.query['hub.challenge'];
  if (canReceive() && mode === 'subscribe' && token && safeEq(token, wa().verifyToken)) return res.status(200).type('text/plain').send(String(challenge));
  res.sendStatus(403);
}

function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// يتحقق من توقيع Meta على الجسم الخام (X-Hub-Signature-256) قبل أي معالجة
export function handleWebhook(req, res) {
  if (!canReceive()) return res.sendStatus(404);
  const sig = req.get('x-hub-signature-256') || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', wa().appSecret).update(req.body).digest('hex');
  if (!safeEq(sig, expected)) return res.sendStatus(401);
  let payload;
  try { payload = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
  // نرد بسرعة؛ Meta تعيد الإرسال عند التأخر، والتكرار يُمنع بمعرّف الرسالة
  res.sendStatus(200);
  try { ingest(payload); } catch (e) { console.error('[whatsapp] ingest failed', e); }
}

export function ingest(payload) {
  const d = db();
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const contacts = new Map((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || '']));
      for (const m of v.messages || []) {
        const eid = 'wa:' + m.id;
        const fresh = d.prepare('INSERT OR IGNORE INTO webhook_events (id, provider, received_at, payload) VALUES (?, ?, ?, ?)').run(eid, 'whatsapp', now(), JSON.stringify(m)).changes;
        if (!fresh) continue; // حدث مكرر
        const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || (m.type !== 'text' ? `[${m.type}]` : '');
        const t = now();
        d.prepare(`INSERT OR IGNORE INTO inbox (id, source, kind, name, phone, phone_norm, message, payload, external_id, created_at, updated_at, fv) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(uid(), 'whatsapp', 'message', contacts.get(m.from) || '', '+' + m.from, normalizePhone(m.from), text, JSON.stringify({ type: m.type, timestamp: m.timestamp }), m.id, t, t, '{}');
      }
      // تحديثات حالة الرسائل (statuses) تُتجاهل حالياً لأننا لا نرسل من المنظومة
      // Coexistence: ما يرسله الوسيط من تطبيق واتساب للأعمال يصل كـ«صدى»؛ نسجله في سجل الشخص إن كان معروفاً (لا يُنشئ وارداً)
      for (const m of v.message_echoes || []) {
        const fresh = d.prepare('INSERT OR IGNORE INTO webhook_events (id, provider, received_at, payload) VALUES (?, ?, ?, ?)').run('wa-echo:' + m.id, 'whatsapp', now(), JSON.stringify(m)).changes;
        if (!fresh) continue;
        const ph = d.prepare('SELECT person_id FROM phones WHERE normalized = ? AND archived_at IS NULL LIMIT 1').get(normalizePhone(m.to || ''));
        if (!ph) continue;
        const text = m.text?.body || `[${m.type}]`;
        const t = now();
        const at = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : t;
        d.prepare("INSERT INTO activities (id, kind, body, person_id, occurred_at, created_at, updated_at, fv) VALUES (?, 'whatsapp', ?, ?, ?, ?, ?, '{}')").run(uid(), 'أُرسل من تطبيق واتساب: ' + text, ph.person_id, at, t, t);
      }
    }
  }
}
