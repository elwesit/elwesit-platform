// دخول واحد تُحفظ جلسته وتُستعمل في بقية المسارات (حد محاولات الدخول لكل عنوان يمنع الدخول في كل اختبار)
import { test as setup, expect } from '@playwright/test';
export const AUTH = 'tests/e2e/.auth.json';
setup('دخول المدير', async ({ page }) => {
  await page.goto('/admin/');
  await page.getByLabel('البريد الإلكتروني').fill('admin@e2e.test');
  await page.getByLabel('كلمة المرور').fill('E2e-pass-123456');
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page.getByRole('heading', { name: 'ما يحتاج إلى تصرف اليوم' })).toBeVisible();
  await page.context().storageState({ path: AUTH });
});
