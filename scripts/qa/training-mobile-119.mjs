// GOAL-119: QA do app real usando a entrada Demo existente.
// Requer Playwright disponível; informe GOAL119_PLAYWRIGHT_PACKAGE (package.json absoluto)
// e GOAL119_QA_OUTPUT. O servidor é configurável via GOAL119_QA_URL.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
const require = createRequire(process.env.GOAL119_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
const out = path.resolve(process.env.GOAL119_QA_OUTPUT || '.validation/goal119');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let server;
let qaUrl = process.env.GOAL119_QA_URL;
if (!qaUrl) {
  const root = path.resolve('out');
  const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2' };
  server = http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      const body = fs.readFileSync(file);
      res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  qaUrl = 'http://127.0.0.1:' + server.address().port;
}
const sizes = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 412, height: 915 }];
async function bounds(page, selector = '.training-dialog') {
  await page.waitForTimeout(250); // Aguarda a animação de entrada antes de medir o painel.
  const box = await page.locator(selector).last().boundingBox();
  assert(box && box.x >= 11 && box.y >= 11);
  const viewport = page.viewportSize();
  assert(box.x + box.width <= viewport.width - 11 && box.y + box.height <= viewport.height - 11);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert(await page.evaluate(({ x, y, width }) => Boolean(document.elementFromPoint(x + width / 2, y + 44)?.closest('.training-dialog')), box), 'Cabeçalho do modal coberto por outra camada');
  return box;
}
try {
  for (const viewport of sizes) {
    const result = { viewport, checks: [], screenshots: [], errors: [] };
    results.push(result);
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, timezoneId: 'America/Sao_Paulo' });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => result.errors.push(error.message));
    const shot = async (name) => {
      await page.waitForTimeout(250);
      for (const text of await page.locator('span').allTextContents()) { const counter = text.trim().match(/^(\d+)\/(\d+)$/); if (counter) assert(Number(counter[1]) >= 1 && Number(counter[1]) <= Number(counter[2])); }
      const filename = viewport.width + '-' + name + '.png';
      await page.screenshot({ path: path.join(out, filename), animations: 'disabled' });
      result.screenshots.push(filename);
    };
    const pass = (name) => { result.checks.push(name); console.log(viewport.width, name); };
    try {
      await page.goto(qaUrl, { waitUntil: 'networkidle' });
      // Aguarda o backup criado pela hidratação para não disputar a entrada com o boot.
      await page.waitForFunction(() => localStorage.getItem('gymflow:state:v1:hybrid-core-backup:v2') !== null);
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: 'Entrar como Usuário Demo', exact: true }).click();
      await page.getByRole('button', { name: /começar treino/i }).waitFor();
      await page.waitForTimeout(600);
      assert.equal(await page.getByRole('button', { name: 'Treinar', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: /começar treino/i }).count(), 1);
      await shot('home');
      pass('home: CTA único, resumo semanal real');
      await page.getByRole('button', { name: /começar treino/i }).click();
      let dialog = page.getByRole('dialog', { name: 'Como você está hoje?', exact: true });
      await dialog.waitFor();
      assert.equal(await dialog.locator('[aria-pressed=true]').count(), 0);
      assert.equal(await dialog.getByRole('button', { name: 'Pular', exact: true }).count(), 1);
      assert(await dialog.getByRole('button', { name: 'Escolha as 5 respostas', exact: true }).isDisabled());
      await bounds(page);
      await shot('checkin-empty');
      if (viewport.width === 360) {
        await dialog.getByRole('button', { name: 'Pular', exact: true }).click();
        await page.getByText('Check-in pulado. Nenhuma resposta foi enviada.', { exact: true }).waitFor();
        pass('check-in: pular explícito sem respostas');
      } else {
        await dialog.getByRole('button', { name: /Alta/ }).click();
        assert(await dialog.getByRole('button', { name: 'Escolha as 5 respostas', exact: true }).isDisabled());
        for (const name of [/Ótimo/, /Nenhuma/, /Baixo/, /Livre/]) await dialog.getByRole('button', { name }).click();
        await shot('checkin-chosen');
        await dialog.getByRole('button', { name: /Concluir Check-in/i }).click({ clickCount: 2, delay: 30 });
        pass('check-in: cinco escolhas explícitas, envio único');
      }
      let card = page.locator('[id^=exercise-card-]').first();
      await card.waitFor();
      const row = card.locator('[id^=set-row-]').filter({ has: page.getByLabel('Carga da série 1 (kg)', { exact: true }) }).first();
      const rowId = await row.getAttribute('id');
      await row.getByLabel('Carga da série 1 (kg)', { exact: true }).fill('12,5');
      await row.getByLabel('Repetições feitas da série 1', { exact: true }).fill('11');
      await row.getByRole('button', { name: 'Concluir série 1', exact: true }).click({ clickCount: 2, delay: 30 });
      await row.getByRole('button', { name: 'Desmarcar série 1', exact: true }).waitFor();
      assert.equal(Number((await row.getByLabel('Carga da série 1 (kg)', { exact: true }).inputValue()).replace(',', '.')), 12.5);
      await page.waitForTimeout(550); // Nova ação intencional depois da janela de toque duplo.
      await page.getByRole('button', { name: /Ir para série atual/i }).click();
      assert(await page.evaluate(() => { const row = document.activeElement?.closest('[id^=set-row-]'); return row?.textContent.includes('Série atual') && document.activeElement.getAttribute('aria-label')?.startsWith('Carga da série'); }));
      await shot('set-current');
      pass('sessão: carga/repetições, toque duplo preserva conclusão, foco na série pendente indicada');
      await page.getByRole('button', { name: /Pular descanso/i }).click({ clickCount: 2, delay: 30 });
      await page.getByRole('button', { name: /Adicionar Exercício/i }).click();
      dialog = page.getByRole('dialog', { name: 'Adicionar exercício', exact: true });
      await dialog.waitFor();
      await bounds(page);
      assert.match(await dialog.getByRole('status').innerText(), /^30 de \d+ exercícios$/);
      await dialog.getByRole('button', { name: /Carregar mais/ }).click();
      assert.match(await dialog.getByRole('status').innerText(), /^60 de \d+ exercícios$/);
      await dialog.getByRole('button', { name: 'Peito', exact: true }).click();
      const items = () => dialog.locator('button').filter({ has: page.locator('span.block.text-sm') });
      assert(await items().count() > 0);
      for (const text of await items().allTextContents()) assert.match(text, /Peito ·/);
      await dialog.getByLabel('Buscar exercício', { exact: true }).fill('remada');
      assert.equal(await items().count(), 0);
      await dialog.getByRole('button', { name: 'Costas', exact: true }).click();
      assert(await items().count() > 0);
      for (const text of await items().allTextContents()) assert.match(text, /Costas ·/);
      await shot('add-back-search');
      await dialog.getByLabel('Buscar exercício', { exact: true }).fill('supino');
      assert.equal(await items().count(), 0);
      await dialog.getByRole('button', { name: 'Peito', exact: true }).click();
      await shot('add-chest-search');
      await dialog.getByRole('button', { name: /Supino Reto com Barra/ }).click();
      card = page.locator('[id^=exercise-card-]').filter({ has: page.getByText('Supino Reto com Barra', { exact: true }) }).last();
      await card.waitFor();
      pass('adicionar: paginação explícita, Peito/Costas e busca combinados, inclusão real');
      await card.getByRole('button', { name: 'Ver guia técnico', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Guia técnico de execução', exact: true });
      await dialog.waitFor();
      await bounds(page);
      assert.match(await dialog.innerText(), /Supino/);
      assert.doesNotMatch(await dialog.innerText(), /Dica de Execução da IA|CREF|Instrutor:/);
      const returnBox = await dialog.getByRole('button', { name: /Voltar ao treino/i }).boundingBox();
      assert(returnBox && returnBox.y + returnBox.height <= viewport.height - 12, 'CTA do guia exige rolagem inicial');
      await shot('technique');
      await dialog.getByRole('button', { name: /Voltar ao treino/i }).click();
      await card.waitFor();
      await card.getByRole('button', { name: 'Trocar', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Trocar exercício', exact: true });
      await dialog.waitFor();
      assert.equal(await dialog.getByText('Por que você quer trocar?', { exact: true }).count(), 0);
      for (const text of await items().allTextContents()) assert.match(text, /Peito ·/);
      await bounds(page);
      await shot('swap-eligible');
      const firstSubstitute = items().first();
      const substituteName = await firstSubstitute.locator('span.block.text-sm').innerText();
      await firstSubstitute.click();
      await page.keyboard.press('Tab');
      assert(await dialog.evaluate(el => el.contains(document.activeElement)));
      assert(await dialog.getByRole('button', { name: 'Confirmar troca', exact: true }).isDisabled());
      await dialog.getByRole('button', { name: 'Outro', exact: true }).click();
      assert(await dialog.getByRole('button', { name: 'Confirmar troca', exact: true }).isDisabled());
      await dialog.getByLabel(/Detalhe do motivo/).fill('Preferência durante QA');
      await shot('swap-confirm');
      await dialog.getByRole('button', { name: 'Confirmar troca', exact: true }).click({ clickCount: 2, delay: 30 });
      await page.locator('[id^=exercise-card-]').filter({ has: page.getByText(substituteName, { exact: true }) }).waitFor();
      pass('troca: elegíveis primeiro, motivo depois, confirmação real e foco contido');
      await page.getByRole('button', { name: 'Exercícios', exact: true }).click();
      await page.getByRole('button', { name: 'Costas', exact: true }).click();
      const cards = () => page.locator('main .glass').filter({ has: page.locator('h3') });
      assert(await cards().count() > 0);
      for (const text of await cards().allTextContents()) assert.match(text, /Costas •/);
      await page.getByRole('button', { name: 'Ombros', exact: true }).click();
      await page.getByPlaceholder('Buscar por nome (ex: supino, agachamento)...').fill('Desenvolvimento de Ombros com Halteres');
      await cards().first().getByRole('button', { name: 'Ver técnica', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Desenvolvimento de Ombros com Halteres', exact: true });
      await dialog.waitFor();
      assert.match(await dialog.innerText(), /Vídeo técnico ainda não disponível para este exercício/);
      assert.doesNotMatch(await dialog.innerText(), /Supino/);
      await bounds(page);
      await shot('own-media-unmapped');
      const simulated = await page.addStyleTag({ content: '.training-overlay{padding-top:24px!important;padding-bottom:34px!important}.training-dialog{max-height:calc(100dvh - 58px)!important}' });
      const simulatedBounds = await dialog.boundingBox();
      assert(simulatedBounds.y >= 24 && simulatedBounds.y + simulatedBounds.height <= viewport.height - 34);
      await shot('safe-area-simulated');
      await simulated.evaluate(el => el.remove());
      await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
      pass('biblioteca: taxonomia igual, mídia própria sem fallback; insets simulados 24/34');
      await page.getByRole('button', { name: 'Hoje', exact: true }).click();
      await page.getByRole('button', { name: /Continuar treino/i }).click();
      await page.locator('#' + rowId).getByRole('button', { name: 'Desmarcar série 1', exact: true }).waitFor();
      await page.waitForTimeout(700);
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('#' + rowId).getByRole('button', { name: 'Desmarcar série 1', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
      await bounds(page);
      await shot('finish');
      pass('persistência: série reaberta após reload; resumo limitado ao viewport');
      await page.evaluate(() => {
        const failWrite = () => { throw new DOMException('Falha de gravação injetada somente no QA', 'QuotaExceededError'); };
        IDBObjectStore.prototype.add = failWrite;
        IDBObjectStore.prototype.put = failWrite;
      });
      await page.getByRole('dialog', { name: 'Resumo do treino', exact: true }).getByRole('button', { name: 'Registrar Treino Parcial', exact: true }).click();
      const failureNotice = page.getByText('O treino não foi confirmado. Ele permanece aberto para você tentar novamente.', { exact: true });
      await failureNotice.waitFor();
      const failureBox = await failureNotice.boundingBox();
      assert(await failureNotice.evaluate(el => Number(getComputedStyle(el.closest('[data-app-notice]')).zIndex) >= 100));
      assert(failureBox && await page.evaluate(({ x, y, width, height }) => { const notice = document.elementFromPoint(x + width / 2, y + height / 2)?.closest('[role=alert], [data-app-notice="error"]'); return notice?.textContent.includes('não foi confirmado'); }, failureBox), 'Nenhum erro de gravação visível acima do resumo');
      assert(await page.getByRole('dialog', { name: 'Resumo do treino', exact: true }).isVisible());
      await shot('finish-storage-error');
      pass('falha injetada de gravação: erro visível acima do resumo, sessão permanece aberta');
      assert.equal(result.errors.length, 0, result.errors.join('\n'));
      result.status = 'passed';
    } catch (error) {
      result.status = 'failed';
      result.failure = error.stack;
      await shot('failure');
      throw error;
    } finally {
      fs.writeFileSync(path.join(out, 'qa-results.json'), JSON.stringify(results, null, 2));
      await context.close();
    }
  }
} finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
