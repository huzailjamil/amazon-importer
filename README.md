# Product Importer V2

Secure multi-user ecommerce product importer for a single Linux/cPanel server.

## What V2 adds

- User registration, login and logout
- Password hashing with bcrypt
- Server-side database sessions in HttpOnly cookies
- User/admin roles and protected dashboards
- Per-user product/store isolation
- Admin overview and audit trail
- Generic authorized URL importer (JSON-LD/OpenGraph)
- SSRF protection for URL imports
- AI rewrite/SEO endpoint protected by authentication + rate limiting
- Saved product drafts
- Shopify OAuth connection
- Shopify access tokens encrypted with AES-256-GCM
- Shopify publishing uses server-stored token; browser never receives it
- Shopify products are always created as DRAFT
- cPanel-compatible Webpack build (`next build --webpack`)

## Amazon URL imports

Paste a public Amazon product URL into the importer to extract the available title, description and feature bullets, brand, ASIN, price, currency, and product images. Amazon may sometimes return a CAPTCHA or block automated requests; the importer reports that condition and does not attempt to bypass it. Page markup can change, so the extractor may require maintenance. Only reuse content and images you have permission to use.

When a hosting provider's server IP is blocked, use the Chrome helper in `browser-extension`. Load that folder as an unpacked extension, open the Amazon product page, and click **Send to dashboard**. The helper captures the available title, description, features, specifications, categories, source tags, price, availability, ratings, gallery and A+ images, loaded videos, and variation options. It opens the import dashboard, transfers the data locally through the extension, and prompts the user to save a draft or review it first. **Copy JSON instead** remains available as a manual fallback. This reads the page already open in the user's browser and does not bypass Amazon CAPTCHA challenges.

## cPanel deployment

1. Create a MySQL database and database user in cPanel and grant ALL PRIVILEGES to that database.
2. Copy `.env.example` to `.env` and fill in all required values.
3. Generate two independent secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use one for `SESSION_SECRET` and one for `TOKEN_ENCRYPTION_KEY`.

4. From the cPanel Node virtual environment/project directory:

```bash
npm install --include=dev
npx prisma generate
npx prisma db push
npm run seed:admin
npm run build
```

5. In cPanel Node.js App use:

- Application mode: Production
- Startup file: `server.js`
- Application URL: your importer subdomain

Then restart the app.

## Shopify OAuth setup

Create a Shopify app and configure the callback URL exactly as:

`https://YOUR_IMPORTER_DOMAIN/api/shopify/callback`

Set `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` in `.env` / cPanel environment variables. Default scopes are `read_products,write_products`.

## OpenAI

Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL`. No key is exposed to users; AI requests run server-side.

## Security notes

- Never put database passwords, Shopify secrets, OpenAI keys, or encryption keys in browser code.
- Keep `.env` outside public file listings and permissions restricted.
- Do not run `npm audit fix --force` on production without testing because it can make breaking dependency changes.
- Add email verification and password reset before opening public registration to a broad audience.
