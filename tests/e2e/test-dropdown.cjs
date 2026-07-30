const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  
  await page.goto('http://localhost:9090/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  const url = page.url();
  console.log('URL after load:', url);
  
  if (url.includes('login')) {
    await page.fill('input[type="email"]', 'admin@zledger.com');
    await page.fill('input[type="password"]', 'katheikei');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    console.log('URL after login:', page.url());
  }
  
  // If redirected to companies page, select first company
  if (page.url().includes('companies')) {
    const companyCards = await page.$$('button, div[role="button"], a');
    const clicked = await page.evaluate(() => {
      const cards = document.querySelectorAll('[class*="cursor-pointer"]');
      for (const card of cards) {
        if (card.textContent && card.textContent.includes('Apex')) {
          card.click();
          return true;
        }
      }
      // Try clicking any card
      for (const card of cards) {
        if (card.closest('[class*="grid"]')) {
          card.click();
          return 'fallback';
        }
      }
      return false;
    });
    console.log('Company click result:', clicked);
    await page.waitForTimeout(3000);
    console.log('URL after company select:', page.url());
  }
  
  // If still on companies page, try direct approach
  if (page.url().includes('companies')) {
    // Use API to get company and set localStorage directly
    const token = await page.evaluate(() => localStorage.getItem('zledger.token'));
    console.log('Token exists:', !!token);
    
    const resp = await page.evaluate(async (tok) => {
      const r = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + tok } });
      const data = await r.json();
      return data;
    }, token);
    console.log('User data companies:', JSON.stringify(resp?.companies?.map(c => ({id: c.id, name: c.name})).slice(0, 3)));
    
    if (resp?.companies?.length > 0) {
      const companyId = resp.companies[0].id;
      await page.evaluate((cid) => {
        localStorage.setItem('zledger.company', cid);
      }, companyId);
      console.log('Set company to:', companyId);
      await page.goto('http://localhost:9090/vouchers', { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      console.log('URL after setting company:', page.url());
    }
  }
  
  await page.goto('http://localhost:9090/vouchers', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log('URL at vouchers:', page.url());
  
  const allInputs = await page.$$eval('input', els => els.map(el => ({
    type: el.type, role: el.getAttribute('role'), placeholder: el.placeholder, disabled: el.disabled,
  })));
  console.log('All inputs:', JSON.stringify(allInputs, null, 2));
  
  const comboboxes = await page.$$('[role="combobox"]');
  console.log(`Combobox count: ${comboboxes.length}`);
  
  if (comboboxes.length === 0) {
    console.log('No comboboxes found. Taking screenshot.');
    await page.screenshot({ path: '/tmp/vouchers-debug.png', fullPage: true });
    await browser.close();
    return;
  }
  
  const firstCb = comboboxes[0];
  await firstCb.click();
  await page.waitForTimeout(500);
  
  const popup = await page.$('[data-master-popup="true"]');
  console.log(`Popup visible: ${!!popup}`);
  
  if (!popup) {
    await page.screenshot({ path: '/tmp/no-popup.png', fullPage: true });
    await browser.close();
    return;
  }
  
  const optionTexts = await popup.$$eval('.cursor-pointer', els => els.map(el => el.textContent?.trim()));
  console.log(`Options (${optionTexts.length}):`, optionTexts.slice(0, 8));
  
  const getHighlightState = async () => {
    return popup.$$eval('.cursor-pointer', els => 
      els.map((el, i) => ({ i, highlighted: el.className.includes('bg-slate-100') || el.className.includes('bg-[#1a1a24]'), text: el.textContent?.substring(0, 25) }))
    );
  };
  
  console.log('\nBefore arrows:', JSON.stringify(await getHighlightState()));
  
  await firstCb.focus();
  await page.waitForTimeout(100);
  
  let focusInfo = await page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.tagName, role: el?.getAttribute('role'), value: el?.value?.substring(0, 30) };
  });
  console.log('Focus before arrows:', JSON.stringify(focusInfo));
  
  console.log('\n--- ArrowDown 1 ---');
  
  // Inject debug listener to see if keydown fires at document level
  await page.evaluate(() => {
    window.__keydownLog = [];
    document.addEventListener('keydown', (e) => {
      window.__keydownLog.push({ key: e.key, target: e.target?.tagName, phase: e.eventPhase, defaultPrevented: e.defaultPrevented, propagationStopped: e.cancelBubble });
    }, true);
  });
  
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  
  const keyLog = await page.evaluate(() => window.__keydownLog);
  console.log('Keydown events captured:', JSON.stringify(keyLog));
  
  focusInfo = await page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.tagName, role: el?.getAttribute('role'), value: el?.value?.substring(0, 30) };
  });
  console.log('Focus after ArrowDown 1:', JSON.stringify(focusInfo));
  console.log('Highlight after 1:', JSON.stringify(await getHighlightState()));
  
  const popupStill = await page.$('[data-master-popup="true"]');
  console.log(`Popup still visible: ${!!popupStill}`);
  
  if (!popupStill) {
    console.log('POPUP DISAPPEARED after ArrowDown!');
    await page.screenshot({ path: '/tmp/popup-gone.png', fullPage: true });
    await browser.close();
    return;
  }
  
  console.log('\n--- ArrowDown 2 ---');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  console.log('Highlight after 2:', JSON.stringify(await getHighlightState()));
  
  console.log('\n--- ArrowDown 3 ---');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  console.log('Highlight after 3:', JSON.stringify(await getHighlightState()));
  
  await page.screenshot({ path: '/tmp/after-arrows.png', fullPage: true });
  
  await browser.close();
})();
