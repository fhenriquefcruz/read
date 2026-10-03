module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      url: ['http://127.0.0.1:4174/read/'],
      startServerCommand:
        'npm run preview -- --host 127.0.0.1 --port 4174',
      startServerReadyPattern: 'Local',
      startServerReadyTimeout: 15000,
      settings: {
        chromeFlags: '--no-sandbox --headless',
      },
    },
    assert: {
      assertions: {
        'categories:performance': [
          'error',
          { minScore: 0.9, aggregationMethod: 'median' },
        ],
        'categories:accessibility': [
          'error',
          { minScore: 1, aggregationMethod: 'median' },
        ],
        'categories:best-practices': [
          'error',
          { minScore: 0.95, aggregationMethod: 'median' },
        ],
        'categories:seo': [
          'error',
          { minScore: 0.9, aggregationMethod: 'median' },
        ],
        'first-contentful-paint': [
          'error',
          { maxNumericValue: 1800, aggregationMethod: 'median' },
        ],
        'largest-contentful-paint': [
          'error',
          { maxNumericValue: 2500, aggregationMethod: 'median' },
        ],
        'cumulative-layout-shift': [
          'error',
          { maxNumericValue: 0.1, aggregationMethod: 'median' },
        ],
        'total-blocking-time': [
          'error',
          { maxNumericValue: 250, aggregationMethod: 'median' },
        ],
        'resource-summary:script:size': [
          'error',
          { maxNumericValue: 250000, aggregationMethod: 'median' },
        ],
        'resource-summary:stylesheet:size': [
          'error',
          { maxNumericValue: 100000, aggregationMethod: 'median' },
        ],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: './lighthouse-reports',
    },
  },
};
