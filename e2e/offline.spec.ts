import { expect, test } from '@playwright/test';

test('app shell permanece disponível offline sem simular busca online', async ({
  page,
  context,
}) => {
  await page.goto('./');

  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.ready;
    }
  });

  await page.reload();
  await expect(page.getByText('Da pergunta à evidência.')).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByText('Da pergunta à evidência.')).toBeVisible();
  await page.getByLabel('Pesquisar literatura acadêmica').fill('offline query');
  await page.getByRole('button', { name: 'Pesquisar' }).click();

  await expect(page.getByText('OpenAlex: indisponível')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Crossref: indisponível')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.work-row')).toHaveCount(0);
});
