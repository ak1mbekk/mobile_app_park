const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const map = new URL(process.env.PARK_MAP_URL || 'http://127.0.0.1:8170/demo/map.html');
  const browser = await chromium.launch({executablePath:process.env.BROWSER_EXE});
  try {
    const page = await browser.newPage({viewport:{width:390,height:760}});
    let writeRequests = 0;
    page.on('request', request => { if (request.url().includes('/__park/')) writeRequests++; });
    map.searchParams.set('edit','1');
    map.hash = 'map/1/40.2';
    await page.goto(map.href);
    await page.locator('.place-info h2').waitFor();
    assert.equal(await page.locator('#map').getByText(/Переместить метку|Изменить границу|Сохранить положение/).count(),0);
    assert.equal(await page.locator('#map a[href*="align.html"]').count(),0);
    assert.equal(writeRequests,0);
    await page.goto(new URL('align.html#boundary=1%2F40.2', map).href);
    await page.waitForURL('**/map.html#map/1/40.2');
    await page.locator('.map-walk-button').waitFor();
    console.log('Read-only place card and old editor link passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode=1;});
