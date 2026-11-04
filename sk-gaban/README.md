# SK Gaban Website

Official website of the Sangguniang Kabataan of Barangay Gaban. A small full-stack app: a minimalist blue public site, a REST API, a SQLite database, and an admin page for posting updates.

## Run it

Requires Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env     # Windows: copy .env.example .env
# open .env and set ADMIN_PASSWORD to your own password
npm start
```

Open http://localhost:8080. The admin page is at http://localhost:8080/admin.

The admin password lives in the `.env` file, which is private and never uploaded to GitHub. The server will not start until `ADMIN_PASSWORD` is set. Values set in the environment override the file.

## What is included

- **Public site** (`/`): hero, about, programs, announcements, upcoming events, officials, contact form
- **Admin** (`/admin`): post and delete announcements and events, add, edit and delete officials, read and delete contact messages
- **API** (`server.js`): Express, with rate limiting on the contact form and login, a honeypot field against spam bots, and input validation
- **Database** (`db.js`): SQLite stored at `data/sk-gaban.db`, created automatically on first run

## First things to change

1. The SK officials are already listed. Open `/admin` > **Officials** to add committee names or make changes.
2. Delete the sample announcement and event, then post real ones.
3. Edit the Mission, Vision and Values text in `public/index.html`.
4. Add the real contact details in the Contact section of `public/index.html`.

## Colors

All colors are CSS variables at the top of `public/styles.css`, so the blue palette can be adjusted in one place.

## Back up your data

Copy `data/sk-gaban.db` regularly. Everything the SK posts and every message received is stored in that single file.

## Deploying

Any host that runs Node 22.13+ and keeps a persistent disk works (a VPS, Render, Railway, Fly.io). Set `PORT` and `ADMIN_PASSWORD` as environment variables on the host (do not upload your `.env` file) and put the site behind HTTPS.
