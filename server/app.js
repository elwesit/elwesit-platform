import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getSettings } from './db.js';
import { loadSession, csrfGuard } from './auth.js';
import { authRouter, adminRouter, apiErrorHandler } from './admin-api.js';
import { publicRouter } from './public-site.js';
import { syncPublicSettings } from './publish.js';
import * as whatsapp from './whatsapp.js';

function tileOrigin() {
  try { return new URL(getSettings().map_tiles_url.replace(/\{[a-z]\}/g, 'a')).origin.replace('://a.', '://*.'); } catch { return 'https://tile.openstreetmap.org'; }
}

export function createApp() {
  syncPublicSettings();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy ? 1 : false);

  app.use((req, res, next) => {
    const tiles = tileOrigin();
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'geolocation=(self), microphone=(self), camera=(self)',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: ${tiles} https://tile.openstreetmap.org https://server.arcgisonline.com`,
        "media-src 'self' blob:",
        "connect-src 'self'",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "manifest-src 'self'",
        "worker-src 'self'",
      ].join('; '),
    });
    if (config.secureCookies) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  // webhook واتساب يحتاج الجسم الخام للتحقق من التوقيع
  app.get('/webhooks/whatsapp', whatsapp.verifyWebhook);
  app.post('/webhooks/whatsapp', express.raw({ type: '*/*', limit: '1mb' }), whatsapp.handleWebhook);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(loadSession);

  const staticOpts = { maxAge: config.isProd ? '7d' : 0, fallthrough: true, index: false };
  app.use('/static', express.static(path.join(config.root, 'public-static'), staticOpts));
  app.use('/vendor/leaflet', express.static(path.join(config.root, 'node_modules', 'leaflet', 'dist'), staticOpts));
  // الوسائط العامة: موجودة فقط ما دام العقار منشوراً
  app.use('/media', express.static(config.publicMediaDir, { maxAge: '1h', index: false, dotfiles: 'deny', fallthrough: false }));

  app.use('/api/auth', csrfGuard, authRouter());
  app.use('/api/admin', csrfGuard, adminRouter());
  app.use('/api', (req, res, next) => (req.path.startsWith('/public/') ? next() : res.status(404).json({ error: 'not_found' })));

  // مساحة الإدارة (تطبيق PWA). الواجهة نفسها لا تحتوي بيانات؛ البيانات تأتي من /api/admin بعد التحقق.
  const adminDist = path.join(config.root, 'admin-ui', 'dist');
  app.get('/admin/sw.js', (req, res) => { res.set('Service-Worker-Allowed', '/admin/'); res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(adminDist, 'sw.js')); });
  app.use('/admin', express.static(adminDist, { index: false, maxAge: config.isProd ? '30d' : 0, setHeaders: (res, p) => { if (p.endsWith('.webmanifest') || p.endsWith('.html')) res.set('Cache-Control', 'no-cache'); } }));
  app.get(/^\/admin(\/.*)?$/, (req, res) => {
    const index = path.join(adminDist, 'index.html');
    if (!fs.existsSync(index)) return res.status(503).send('لم تُبنَ واجهة الإدارة بعد: npm run build');
    res.set('Cache-Control', 'no-cache');
    res.sendFile(index);
  });

  app.use(publicRouter());
  app.use('/api', apiErrorHandler);
  app.use(apiErrorHandler);
  return app;
}
