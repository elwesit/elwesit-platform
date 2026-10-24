import test from 'node:test';
import assert from 'node:assert/strict';
import { inquiryMessage, replyMessage, factLines } from '../../shared/inquiry.js';

const f = { title: 'قطعة أرضية في تفرغ زينة', ref: 'W0012', place: 'تفرغ زينة، نواكشوط الغربية', area_m2: 1200, price: '3 مليون أوقية جديدة (30 مليون أوقية قديمة)', url: 'https://x.test/p/W0012' };

test('رسالة الزبون بالشكل المطلوب، مع الاستفسار في آخرها', () => {
  assert.equal(inquiryMessage(f, 'هل السعر قابل للتفاوض؟'), [
    'السلام عليكم، أنا مهتم بهذا العقار المنشور في موقع الوسيط العقاري:',
    '• العقار: قطعة أرضية في تفرغ زينة', '• رقم العرض: W0012', '• المنطقة: تفرغ زينة، نواكشوط الغربية',
    '• المساحة: 1٬200 م²', '• السعر: 3 مليون أوقية جديدة (30 مليون أوقية قديمة)', '• رابط العقار: https://x.test/p/W0012',
    '• استفساري: هل السعر قابل للتفاوض؟',
  ].join('\n'));
});

test('تُحذف الأسطر التي لا تتوفر بياناتها', () => {
  const m = inquiryMessage({ title: 'شقة', ref: 'W1', place: '', area_m2: null, price: '', url: 'u' }, '  ');
  assert.ok(!/المنطقة|المساحة|السعر|استفساري/.test(m));
  assert.equal(factLines({ ref: 'W1' }).length, 1);
});

test('رسالة الرد من الإدارة تتضمن بيانات العقار واسم الزبون', () => {
  const m = replyMessage(f, { name: 'أحمد' });
  assert.ok(m.startsWith('السلام عليكم أحمد، معك الوسيط العقاري بخصوص استفسارك'));
  for (const s of ['W0012', '1٬200 م²', 'https://x.test/p/W0012', '3 مليون', 'تفرغ زينة']) assert.ok(m.includes(s), s);
});
