// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

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
  //
  // The Vercel adapter (rather than @astrojs/node) is required so Vercel's
  // build can generate the routing manifest + serverless function for the
  // on-demand /api/chat route — @astrojs/node's standalone server isn't
  // something Vercel knows how to run, which is what caused the 404.
  // It fully supports this static+on-demand hybrid mode (hybridOutput/
  // staticOutput are both "stable" in @astrojs/vercel), so no `output`
  // change is needed.
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()]
  }
});