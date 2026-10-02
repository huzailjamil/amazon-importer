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

## Important Amazon note

Direct Amazon page scraping is intentionally not enabled. Amazon pages should be integrated via an authorized Amazon API/feed or another source you have the right to reuse. Users can still paste accurate product facts manually and use the AI rewrite/SEO workflow.

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
