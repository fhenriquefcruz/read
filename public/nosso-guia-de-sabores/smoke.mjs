import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:8765/public/nosso-guia-de-sabores/";
const browser=await chromium.launch({headless:true});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1365,height:900},locale:"pt-BR"});
  page.on("pageerror",err=>errors.push(err.message));
  await page.goto(base,{waitUntil:"domcontentloaded"});
  await page.getByRole("heading",{name:/Nossa jornada gastronômica/}).waitFor();
  assert.equal(await page.locator(".kpi").count(),4);
  await page.locator('.sidebar [data-nav="settings"]').click();
  await page.locator("#member0").fill("Ana");
  await page.locator("#member1").fill("Bia");
  await page.locator('#settings-form button[type="submit"]').click();
  await page.locator(".top-add").click();
  await page.locator("#place-name").fill("Restaurante Teste");
  await page.locator("#place-city").fill("Campo Grande");
  await page.locator("#place-lat").fill("-20.4600");
  await page.locator("#place-lng").fill("-54.6100");
  await page.locator("#visit-date").fill("2026-10-20");
  for(const key of ["sabor","atendimento","ambiente","custo","apresentacao","experiencia"]){
    await page.locator("#score-0-"+key).selectOption("8");
    await page.locator("#score-1-"+key).selectOption("9");
  }
  await page.locator('#visit-form button[type="submit"]').click();
  await page.waitForURL("**/#history");
  assert.match(await page.locator(".history-card").first().innerText(),/Restaurante Teste/);
  await page.locator('.sidebar [data-nav="ranking"]').click();
  assert.match(await page.locator(".rank-list").first().innerText(),/Restaurante Teste/);
  assert.match(await page.locator(".rank-list").first().innerText(),/8,5/);
  await page.locator('.sidebar [data-nav="map"]').click();
  await page.locator(".map-place-list .map-place").first().waitFor();
  assert.match(await page.locator(".map-place-list").innerText(),/Restaurante Teste/);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator(".map-place-list .map-place").first().waitFor();
  assert.match(await page.locator(".map-place-list").innerText(),/Restaurante Teste/);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator(".bottom-nav").isVisible(),true);
  await page.locator('.bottom-nav [data-nav="ranking"]').click();
  assert.match(await page.locator(".rank-list").first().innerText(),/Restaurante Teste/);
  assert.deepEqual(errors,[]);
  console.log("PASS: desktop, cadastro do casal, avaliação, ranking, mapa, persistência e navegação mobile.");
}finally{
 await browser.close();
}
