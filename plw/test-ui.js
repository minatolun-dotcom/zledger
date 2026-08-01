import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to login page
  await page.goto('http://localhost:9090');

  // Fill login form
  await page.fill('input[type="email"]', 'admin@zledger.com');
  await page.fill('input[type="password"]', 'katheikei');
  await page.click('button[type="submit"]');

  // Wait for navigation to dashboard
  await page.waitForURL('**/dashboard');

  // Capture dashboard
  await page.screenshot({ path: '/home/popsickle/ktMedia/Media1/Project/Zledger/plw/screenshots/dashboard.png' });

  // Navigate to companies
  await page.click('text=Companies');
  await page.waitForURL('**/companies');
  await page.screenshot({ path: '/home/popsickle/ktMedia/Media1/Project/Zledger/plw/screenshots/companies.png' });

  // Select Apex Enterprises
  await page.click('text=Apex Enterprises');
  await page.waitForTimeout(1000);

  // Navigate to vouchers
  await page.click('text=Vouchers');
  await page.waitForURL('**/vouchers');
  await page.screenshot({ path: '/home/popsickle/ktMedia/Media1/Project/Zledger/plw/screenshots/vouchers.png' });

  // Navigate to reports
  await page.click('text=Reports');
  await page.waitForURL('**/reports');
  await page.screenshot({ path: '/home/popsickle/ktMedia/Media1/Project/Zledger/plw/screenshots/reports.png' });

  await browser.close();
})();
