import {chromium} from "@playwright/test";
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
const base="http://127.0.0.1:8765/nosso-guia-de-sabores/";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:850}});
const page=await context.newPage();
page.on("dialog",async dialog=>dialog.accept());
try{
  await page.goto(base,{waitUntil:"domcontentloaded"});
  await page.locator('button[data-nav="settings"]').first().click();
  await page.locator("#member0").fill("Ana");
  await page.locator("#member1").fill("Bia");
  await page.locator('#settings-form button[type="submit"]').click();
  await page.locator("button.top-add").click();
  await page.locator("#place-name").fill("Café de Teste");
  await page.locator("#place-category").selectOption("Cafeteria");
  await page.locator("#place-city").fill("Campo Grande");
  await page.locator("#place-lat").fill("-20.46");
  await page.locator("#place-lng").fill("-54.62");
  await page.locator("#visit-date").fill("2026-10-20");
  for(const criterion of ["sabor","atendimento","ambiente","custo","apresentacao","experiencia"]){
    await page.locator("#score-0-"+criterion).selectOption("9");
    await page.locator("#score-1-"+criterion).selectOption("7");
  }
  await page.locator('#visit-form button[type="submit"]').click();
  await page.waitForURL("**/#history");
  await page.locator(".history-card").first().waitFor();
  assert.match(await page.locator(".history-card").first().innerText(),/Café de Teste/);
  await page.locator('button[data-nav="ranking"]').first().click();
  await page.locator(".rank-score strong").first().waitFor();
  assert.equal((await page.locator(".rank-score strong").first().innerText()).trim(),"8,0");
  await page.locator('button[data-nav="map"]').first().click();
  await page.locator(".map-place").first().waitFor();
  assert.match(await page.locator(".map-place").first().innerText(),/Café de Teste/);
  assert.match(await page.locator(".map-place a").first().getAttribute("href"),/google.com\/maps\/search/);

  await page.locator("button.top-add").click();
  await page.locator("#place-existing").selectOption({label:"Café de Teste · Cafeteria"});
  await page.locator("#visit-date").fill("2026-10-21");
  for(const criterion of ["sabor","atendimento","ambiente","custo","apresentacao","experiencia"]){
    await page.locator("#score-0-"+criterion).selectOption("7");
    await page.locator("#score-1-"+criterion).selectOption("5");
  }
  await page.locator('#visit-form button[type="submit"]').click();
  await page.waitForURL("**/#history");
  assert.equal(await page.locator(".history-card").count(),2);
  await page.locator('button[data-nav="ranking"]').first().click();
  assert.equal((await page.locator(".rank-score strong").first().innerText()).trim(),"7,0");
  await page.reload();
  await page.locator(".rank-score strong").first().waitFor();
  assert.equal((await page.locator(".rank-score strong").first().innerText()).trim(),"7,0");

  await page.locator('button[data-nav="settings"]').first().click();
  const downloadPromise=page.waitForEvent("download");
  await page.locator('button[data-action="export"]').click();
  const download=await downloadPromise;
  const path=await download.path();
  const backup=JSON.parse(await readFile(path,"utf8"));
  assert.equal(backup.places.length,1);assert.equal(backup.visits.length,2);
  const fresh=await browser.newContext({viewport:{width:1200,height:800}});
  const restored=await fresh.newPage();
  restored.on("dialog",async d=>d.accept());
  await restored.goto(base);
  await restored.locator('button[data-nav="settings"]').first().click();
  await restored.locator("#import-file").setInputFiles({name:"restaurar.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(backup))});
  await restored.locator('button[data-nav="ranking"]').first().click();
  await restored.locator(".rank-score strong").first().waitFor();
  assert.equal((await restored.locator(".rank-score strong").first().innerText()).trim(),"7,0");
  await fresh.close();

  await page.locator('button[data-nav="history"]').first().click();
  await page.locator(".history-card").first().locator('[data-action="deleteVisit"]').click();
  await page.locator('button[data-nav="ranking"]').first().click();
  await page.locator(".rank-score strong").first().waitFor();
  assert.equal((await page.locator(".rank-score strong").first().innerText()).trim(),"8,0");
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const mobilePage=await mobile.newPage();
  await mobilePage.goto(base);
  await mobilePage.locator(".bottom-nav").waitFor();
  assert.equal(await mobilePage.locator(".bottom-nav").isVisible(),true);
  const overflow=await mobilePage.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=1,"Tela móvel tem rolagem horizontal indevida: "+overflow);
  await mobile.close();
  process.stdout.write("Smoke: formulário, duas notas, ranking, novas visitas, mapa, persistência, backup, exclusão e mobile OK\n");
}finally{await browser.close();}
