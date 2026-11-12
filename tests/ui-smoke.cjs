const { chromium } = require(process.env.WAVEPLAY_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.WAVEPLAY_BROWSER_CHANNEL || 'msedge' });
  const output = path.resolve('.cache/stitch-screenshots');
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const width of [320, 390, 430]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://localhost:8093/', { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.getByText('Tu colección empieza aquí', { exact: true }).waitFor({ timeout: 60000 });
      await page.screenshot({ path: path.join(output, `inicio-${width}.png`) });
      await page.getByRole('tab', { name: 'Biblioteca', exact: true }).click();
      await page.getByRole('tab', { name: 'Canciones', exact: true }).click();
      await page.screenshot({ path: path.join(output, `canciones-${width}.png`) });
      await page.getByRole('tab', { name: 'Playlists', exact: true }).click();
      await page.getByText('Tus playlists · 0', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `playlists-${width}.png`) });
      await page.getByRole('button', { name: 'Crear playlist', exact: true }).first().click();
      await page.getByPlaceholder('Nombre', { exact: true }).fill('Mi playlist de prueba');
      await page.getByText('Crear', { exact: true }).click();
      await page.getByText('Mi playlist de prueba', { exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Perfil', exact: true }).click();
      await page.getByText('Mi perfil musical', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `perfil-${width}.png`) });
      await page.getByRole('tab', { name: 'Explorar', exact: true }).click();
      await page.getByRole('tab', { name: 'Mi música', exact: true }).click();
      await page.getByPlaceholder('Buscar en tu biblioteca').fill('Sin coincidencia');
      await page.getByText('Sin coincidencias', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `explorar-${width}.png`) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow || errors.length) throw new Error(JSON.stringify({ width, overflow, errors }));
      console.log(`PASS: ${width}px navigation, playlist creation, profile and local search`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
