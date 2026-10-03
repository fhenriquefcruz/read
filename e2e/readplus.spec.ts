import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockAcademicApis } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockAcademicApis(page);
  await page.goto('./');
});

test('busca agrega, deduplica por DOI e permite salvar na biblioteca', async ({
  page,
}) => {
  await page
    .getByLabel('Pesquisar literatura acadêmica')
    .fill('machine learning public administration');
  await page.getByRole('button', { name: 'Pesquisar' }).click();

  await expect(
    page.getByText('1 trabalhos únicos encontrados e normalizados.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Machine Learning in Public Administration',
    }),
  ).toHaveCount(1);
  await expect(page.getByText('OpenAlex: 1 resultados')).toBeVisible();
  await expect(page.getByText('Crossref: 1 resultados')).toBeVisible();

  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('button', { name: 'Biblioteca' }).click();

  await expect(
    page.getByRole('button', {
      name: 'Machine Learning in Public Administration',
    }),
  ).toBeVisible();
  await expect(page.getByText('10.1000/readplus.2025.1')).toBeVisible();
});

test('detalhe mostra proveniência, DOI e PDF legítimo', async ({ page }) => {
  await page
    .getByLabel('Pesquisar literatura acadêmica')
    .fill('machine learning');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await page
    .getByRole('button', { name: 'Machine Learning in Public Administration' })
    .click();

  const panel = page.getByLabel('Detalhes do trabalho');
  await expect(panel).toContainText('10.1000/readplus.2025.1');
  await expect(panel).toContainText('OpenAlex + Crossref');
  await expect(
    panel.getByRole('link', { name: 'PDF Open Access' }),
  ).toHaveAttribute('href', 'https://example.org/readplus-paper.pdf');
});

test('continua com fonte real quando um provedor falha', async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockAcademicApis(page, { openAlexFails: true });
  await page.reload();

  await page
    .getByLabel('Pesquisar literatura acadêmica')
    .fill('machine learning');
  await page.getByRole('button', { name: 'Pesquisar' }).click();

  await expect(page.getByText('OpenAlex: indisponível')).toBeVisible();
  await expect(page.getByText('Crossref: 1 resultados')).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Machine Learning in Public Administration',
    }),
  ).toBeVisible();
});

test('não cria resultados artificiais quando todas as fontes falham', async ({
  page,
}) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockAcademicApis(page, { openAlexFails: true, crossrefFails: true });
  await page.reload();

  await page
    .getByLabel('Pesquisar literatura acadêmica')
    .fill('tema sem fallback');
  await page.getByRole('button', { name: 'Pesquisar' }).click();

  await expect(
    page.getByText(
      'Nenhum trabalho correspondeu aos critérios. Nenhum resultado artificial foi adicionado.',
    ),
  ).toBeVisible();
  await expect(page.locator('.work-row')).toHaveCount(0);
});

test('tela inicial não tem violações automáticas WCAG de alto sinal', async ({
  page,
}) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});


test('detalhe explora o grafo acadêmico e expõe autoria qualificada', async ({ page }) => {
  await page
    .getByLabel('Pesquisar literatura acadêmica')
    .fill('machine learning');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await page
    .getByRole('button', { name: 'Machine Learning in Public Administration' })
    .click();

  const panel = page.getByLabel('Detalhes do trabalho');
  await expect(panel.getByText('Universidade Federal de Mato Grosso do Sul')).toBeVisible();
  await expect(panel.getByRole('link', { name: 'ORCID' })).toHaveAttribute(
    'href',
    'https://orcid.org/0000-0000-0000-0001',
  );
  await expect(panel.getByText('Foundations of Digital Government')).toBeVisible();
  await expect(panel.getByText('Accountable AI in Government')).toBeVisible();
  await expect(
    panel.getByText('Algorithmic Decision Support in the Public Sector'),
  ).toBeVisible();

  await panel
    .getByRole('button', { name: /Algorithmic Decision Support in the Public Sector/ })
    .click();

  await expect(
    page.getByLabel('Detalhes do trabalho').getByRole('heading', {
      name: 'Algorithmic Decision Support in the Public Sector',
    }),
  ).toBeVisible();
});

test('detalhe exporta referência em BibTeX', async ({ page }) => {
  await page
    .getByLabel('Pesquisar literatura acadêmica')
    .fill('machine learning');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await page
    .getByRole('button', { name: 'Machine Learning in Public Administration' })
    .click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByLabel('Detalhes do trabalho').getByRole('button', { name: 'BibTeX' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe(
    'machine-learning-in-public-administration.bib',
  );
});


test('workspace preserva evidência rastreável e interpretação após reload', async ({
  page,
}) => {
  await page
    .getByLabel('Pesquisar literatura acadêmica')
    .fill('machine learning public administration');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  await page.getByRole('button', { name: 'Pesquisas' }).click();
  await page.getByLabel('Nome da pesquisa').fill('IA na administração pública');
  await page
    .getByLabel('Pergunta central')
    .fill('Como sistemas de IA apoiam decisões públicas com accountability?');
  await page.getByRole('button', { name: 'Nova pesquisa' }).click();

  const sourceCheckbox = page.getByRole('checkbox', {
    name: /Machine Learning in Public Administration/,
  });
  await sourceCheckbox.check();

  await page
    .getByLabel('Evidência da fonte')
    .fill('Machine learning supports evidence in public administration.');
  await page
    .getByLabel('Sua interpretação')
    .fill('O ganho depende de governança e rastreabilidade da decisão.');
  await page.getByRole('button', { name: 'Registrar evidência' }).click();

  await expect(page.getByLabel('Evidência da fonte')).toHaveValue('');
  await expect(
    page.getByRole('blockquote').filter({
      hasText: 'Machine learning supports evidence in public administration.',
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'O ganho depende de governança e rastreabilidade da decisão.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText('DOI 10.1000/readplus.2025.1', { exact: true }),
  ).toBeVisible();
  await expect(sourceCheckbox).toBeDisabled();

  await page.reload();
  await page.getByRole('button', { name: 'Pesquisas' }).click();

  await expect(
    page.getByRole('blockquote').filter({
      hasText: 'Machine learning supports evidence in public administration.',
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'O ganho depende de governança e rastreabilidade da decisão.',
      { exact: true },
    ),
  ).toBeVisible();
});


test('workspace preserva consulta e filtros do histórico de descoberta', async ({
  page,
}) => {
  await page
    .getByLabel('Pesquisar literatura acadêmica')
    .fill('machine learning public administration');
  await page.getByLabel('Filtrar por status').count();
  await page.locator('.filters').getByLabel('De').fill('2020');
  await page.locator('.filters').getByLabel('Acesso').selectOption('true');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await expect(
    page.getByText('1 trabalhos únicos encontrados e normalizados.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Pesquisas' }).click();
  await page.getByLabel('Nome da pesquisa').fill('Governança algorítmica');
  await page
    .getByLabel('Pergunta central')
    .fill('Quais evidências sustentam o uso responsável de IA pública?');
  await page.getByRole('button', { name: 'Nova pesquisa' }).click();

  const recent = page
    .locator('.recent-query-list')
    .getByRole('button', { name: /machine learning public administration/ });
  await expect(recent).toContainText('ano 2020–…');
  await expect(recent).toContainText('Open Access');
  await recent.click();

  const saved = page.locator('.workspace-query');
  await expect(saved).toContainText('machine learning public administration');
  await expect(saved).toContainText('ano 2020–…');
  await expect(saved).toContainText('Open Access');

  await page.reload();
  await page.getByRole('button', { name: 'Pesquisas' }).click();
  await expect(page.locator('.workspace-query')).toContainText(
    'machine learning public administration',
  );
});
