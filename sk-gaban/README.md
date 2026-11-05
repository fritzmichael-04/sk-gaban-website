# SK Gaban Website

Official website of the Sangguniang Kabataan of Barangay Gaban.

## Stack
- Node.js + Express
- Supabase PostgreSQL (persistent database)
- Static frontend in `public/`
- Vercel deployment

## 1. Configure Supabase

1. Open your Supabase project.
2. Go to **Project Settings → Database → Connection string**.
3. Select the URI connection string. For Vercel, use the Supabase pooler connection string if your project/network requires it (the Session pooler is suitable for persistent server connections; Transaction pooler is useful for serverless workloads).
4. Copy the full connection string and replace its password placeholder with your database password. URL-encode special characters in the password.
5. The app creates the `announcements`, `events`, `officials`, and `messages` tables automatically on its first request. It also inserts starter content only when those tables are empty.

You can also create the tables manually by running `schema.sql` in Supabase SQL Editor.

## 2. Configure Vercel

In **Vercel → Project → Settings → Environment Variables**, add:

- `DATABASE_URL` = your Supabase PostgreSQL connection string
- `ADMIN_PASSWORD` = a strong, unique admin password

Add both to **Production**, **Preview**, and **Development** as appropriate. Do not add quotation marks around the values. After saving, redeploy the latest commit so the new variables are applied.

## 3. Deploy

Push this project to the GitHub repository connected to Vercel. Vercel should detect `server.js` as the Express entry point. Keep the project root directory set to the folder containing `server.js` and `package.json` (the `sk-gaban` folder if the repository contains a parent folder).

No local SQLite database or writable `data/` directory is used. Static assets are served from `public/`.

## 4. Run locally

```bash
npm install
cp .env.example .env
# Edit .env and set DATABASE_URL and ADMIN_PASSWORD
npm start
```

Open `http://localhost:8080` and `http://localhost:8080/admin`.

## Notes
- Never commit or upload your real `.env` file.
- Admin login tokens are signed and expire after eight hours. Logout clears the token in the browser; because tokens are stateless, an already copied token remains valid until expiry.
- The in-memory rate limiter is per function instance. For high-traffic production use, use a shared rate-limit store.
