import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const d = new BrowserDriver(9222);
  await d.connect();
  const captured = await d.eval('window.__mop_captured || []');
  for (const c of captured) {
    if (c.url && (c.url.includes('pos') || c.url.includes('parts'))) {
      console.log('Captured req:', c.url, JSON.stringify(c.data, null, 2));
    }
  }
  const pageState = await d.eval(`(() => {
    return {
      url: window.location.href,
      errorText: document.querySelector('.catalog-error')?.innerText,
      sentText: document.querySelector('.catalog-sent')?.innerText,
      receipt: document.querySelector('.pos-receipt-card')?.innerText,
      cartCount: document.querySelector('.cart-tab')?.innerText,
      bodyTextSnippet: document.body.innerText.slice(0, 400)
    };
  })()`);
  console.log('Page state:', pageState);
  d.close();
}

main().catch(console.error);
