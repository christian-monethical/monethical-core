import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __MANIFEST__: JSON.stringify({ consent: 'consent-AAAA.js', forms: 'forms-BBBB.js', newsletter: 'newsletter-CCCC.js', survey: 'survey-DDDD.js', items: 'items-EEEE.js' }) },
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        settings: { disableJavaScriptFileLoading: true, disableIframePageLoading: true, handleDisabledFileLoadingAsSuccess: true },
      },
    },
    include: ['tests/**/*.test.ts'],
  },
});
