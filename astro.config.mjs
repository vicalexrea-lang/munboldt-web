// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  // `output: 'static'` stays the default — every existing page is still
  // prerendered to plain HTML at build time, exactly as before. The adapter
  // below only adds the *capability* to run specific opted-in routes
  // on-demand; it does not change how any current page is built or served.
  // The single route that opts in is `src/pages/api/chat.ts`
  // (`export const prerender = false`), which proxies chatbot requests to
  // the AI provider so the API key stays on the server and is never sent
  // to the browser.
  adapter: node({ mode: 'standalone' }),
  vite: {
    plugins: [tailwindcss()]
  }
});