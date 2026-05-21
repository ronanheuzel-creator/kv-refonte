// Client HTTP authentifié vers l'API REST WordPress.
// Auth: Basic Auth avec un "Application Password" (cf. wp-admin/profile.php).
//
// Usage:
//   import { wp } from './lib/wp.js';
//   const pages = await wp('/wp/v2/pages', { query: { per_page: 10 } });

import 'dotenv/config';

const { WP_BASE_URL, WP_USER, WP_APP_PASSWORD } = process.env;

if (!WP_BASE_URL || !WP_USER || !WP_APP_PASSWORD) {
  throw new Error(
    'Variables manquantes dans .env: WP_BASE_URL, WP_USER, WP_APP_PASSWORD'
  );
}

if (WP_APP_PASSWORD.startsWith('REMPLACER')) {
  throw new Error(
    'WP_APP_PASSWORD non rempli dans .env — copie la valeur depuis Bitwarden.'
  );
}

const authHeader =
  'Basic ' + Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');

/**
 * Appel générique à l'API REST WordPress.
 * @param {string} path - chemin après `/wp-json` (ex: `/wp/v2/pages`)
 * @param {object} [opts]
 * @param {string} [opts.method='GET']
 * @param {object} [opts.body] - sérialisé en JSON automatiquement
 * @param {object} [opts.query] - query string ({ per_page: 100 })
 */
export async function wp(path, { method = 'GET', body, query } = {}) {
  const url = new URL(`/wp-json${path}`, WP_BASE_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `WP ${method} ${url.pathname}${url.search} → ${res.status} ${res.statusText}\n${text.slice(0, 800)}`
    );
  }
  return text ? JSON.parse(text) : null;
}
