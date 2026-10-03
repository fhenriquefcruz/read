import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockAcademicApis } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockAcademicApis(page);
  await page.goto('./');
});

test('busca agrega, deduplica por DOI e permite salvar na biblioteca', async ({ page }) => {
  await page.getByLabel('Pesquisar literatura acadêmica').fill('machine learning public administration');
  await page.getByRole('button', { name: 'Pesquisar' }).click();

  await expect(page.getByText('1 trabalhos únicos encontrados e normalizados.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Machine Learning in Public Administration' }),
  ).toHaveCount(1);
  await expect(page.getByText('OpenAlex: 1 resultados')).toBeVisible();
  await expect(page.getByText('Crossref: 1 resultados')).toBeVisible();

  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('button', { name: 'Biblioteca' }).click();

  await expect(
    page.getByRole('button', { name: 'Machine Learning in Public Administration' }),
  ).toBeVisible();
  await expect(page.getByText('10.1000/readplus.2025.1')).toBeVisible();
});

test('detalhe mostra proveniência, DOI e PDF legítimo', async ({ page }) => {
  await page.getByLabel('Pesquisar literatura acadêmica').fill('machine learning');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await page
    .getByRole('button', { name: 'Machine Learning in Public Administration' })
    .click();

  const panel = page.getByLabel('Detalhes do trabalho');
  await expect(panel).toContainText('10.1000/readplus.2025.1');
  await expect(panel).toContainText('OpenAlex + Crossref');
  await expect(panel.getByRole('link', { name: 'PDF Open Access' })).toHaveAttribute(
    'href',
    'https://example.org/readplus-paper.pdf',
  );
});

test('continua com fonte real quando um provedor falha', async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockAcademicApis(page, { openAlexFails: true });
  await page.reload();

  await page.getByLabel('Pesquisar literatura acadêmica').fill('machine learning');
  await page.getByRole('button', { name: 'Pesquisar' }).click();

  await expect(page.getByText('OpenAlex: indisponível')).toBeVisible();
  await expect(page.getByText('Crossref: 1 resultados')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Machine Learning in Public Administration' }),
  ).toBeVisible();
});

test('não cria resultados artificiais quando todas as fontes falham', async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockAcademicApis(page, { openAlexFails: true, crossrefFails: true });
  await page.reload();

  await page.getByLabel('Pesquisar literatura acadêmica').fill('tema sem fallback');
  await page.getByRole('button', { name: 'Pesquisar' }).click();

  await expect(
    page.getByText(
      'Nenhum trabalho correspondeu aos critérios. Nenhum resultado artificial foi adicionado.',
    ),
  ).toBeVisible();
  await expect(page.locator('.work-row')).toHaveCount(0);
});

test('tela inicial não tem violações automáticas WCAG de alto sinal', async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});
