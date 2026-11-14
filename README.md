# WanderDesk – accessible travel booking desk

Coursework project for **Accessibility and Usability** (records-management interface).
Scenario: a travel agency booking desk. Staff sign in, add and edit bookings, and look records up in a sortable, filterable table.

**Live URL:** _add your deployed address here_

## Run it locally

Needs Node.js 18 or newer. There are no dependencies, so no `npm install` is required.

```bash
bash start.sh        # easiest: works from any folder, checks Node, then runs  http://127.0.0.1:3000
npm start            # same thing, but run it from inside the wanderdesk folder
```

Demo sign-in (simulated): `agent` / `agent123` or `manager` / `manager123` (managers can also delete bookings).
The first start creates `data/bookings.json` with 40 demo bookings. Reset with `npm run seed`.

## Project layout (one folder per task)

| Task | Files |
|---|---|
| 1 Sign-in | `public/index.html`, `public/js/login.js` |
| 2 Dashboard | `public/dashboard.html`, `public/js/dashboard.js` |
| 3 Booking form (create/edit) | `public/booking-form.html`, `public/js/form.js` |
| 4 Bookings table | `public/bookings.html`, `public/js/bookings.js` |
| Shared | `public/css/styles.css`, `public/js/common.js` |
| 5 Backend + storage | `server/server.js`, `server/validate.js`, `server/seed.js`, `data/bookings.json` |
| 6 Tests and checks | `test/api.test.js`, `tools/static-checks.js`, `tools/contrast.js`, `tools/e2e-smoke.py` |
| 7 Written deliverable | `docs/accessibility-and-evaluation.md` and the PDF built from it |
| 8 Deployment | `deploy/` and the steps below |

## Checks

```bash
npm test                      # API tests
npm run check                 # HTML structure lint + contrast ratios
npm start &                   # then, with Playwright + Chrome installed:
python3 tools/e2e-smoke.py http://127.0.0.1:3000
```

### Run axe DevTools (required by the brief) and record the result

1. In Chrome, install **axe DevTools** from the Chrome Web Store. Start the site with `npm start`.
2. Open the page, press `F12`, choose the **axe DevTools** tab and click **Scan all of my page**.
3. Scan these states: sign-in, sign-in after submitting empty, dashboard, bookings, booking form, booking form after submitting empty.
4. Write the numbers (issues found, issues fixed) and add one screenshot to section 2.1 of `docs/accessibility-and-evaluation.md`, then rebuild the PDF (see "Rebuild the PDF").
5. For the manual test, turn on VoiceOver on a Mac with `Cmd+F5` and try: sign-in errors, saving a booking, sorting the table, deleting (manager). Note what was announced.

Test with many rows: `npm run seed:large` (500 bookings), then `npm start`. `npm run seed` goes back to 40.

### Rebuild the PDF

```bash
pandoc docs/accessibility-and-evaluation.md -s --embed-resources --resource-path=docs -o /tmp/doc.html --metadata pagetitle=WanderDesk
# then print /tmp/doc.html to PDF from your browser (File > Print > Save as PDF)
```

## Deploy to a DigitalOcean droplet with a Namecheap domain

1. **Droplet:** create an Ubuntu 24.04 droplet. Note its IP address.
2. **Domain:** register a domain at Namecheap. In _Advanced DNS_ add an **A record** for `@` and one for `www` pointing to the droplet IP. DNS can take up to an hour.

**Quick way:** copy the project to `/var/www/wanderdesk` on the droplet, then run
`bash /var/www/wanderdesk/deploy/setup-droplet.sh yourdomain.com you@example.com`
(it does steps 3 to 7 below). The manual steps follow if you prefer them.

3. **Server setup** (SSH in as root, or a sudo user):
   ```bash
   apt update && apt install -y nodejs nginx ufw certbot python3-certbot-nginx
   node --version        # needs 18 or newer; if older, install Node 20+ from nodesource.com
   ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
   ```
4. **Upload the project** to `/var/www/wanderdesk` (for example `scp -r wanderdesk root@YOUR_IP:/var/www/`).
5. **Run it as a service:**
   ```bash
   cp /var/www/wanderdesk/deploy/wanderdesk.service /etc/systemd/system/
   chown -R www-data:www-data /var/www/wanderdesk/data
   systemctl daemon-reload && systemctl enable --now wanderdesk
   systemctl status wanderdesk
   ```
6. **Nginx:** edit `deploy/nginx.conf` (replace `example.com` with your domain), then
   ```bash
   cp /var/www/wanderdesk/deploy/nginx.conf /etc/nginx/sites-available/wanderdesk
   ln -s /etc/nginx/sites-available/wanderdesk /etc/nginx/sites-enabled/
   rm -f /etc/nginx/sites-enabled/default
   nginx -t && systemctl reload nginx
   ```
7. **HTTPS:** `certbot --nginx -d yourdomain.com -d www.yourdomain.com`
8. Visit your domain, sign in, add a booking, refresh: it should still be there. Put the URL in this README and in the PDF.

The data file lives in `/var/www/wanderdesk/data/`; back it up by copying `bookings.json`.

## Run with Docker (optional)

Needs Docker Desktop **running**. Easiest:

```bash
bash start.sh docker             # checks Docker, then builds and starts  http://localhost:3000
```
Or by hand, from inside the folder that contains `Dockerfile` and `public/`: `docker compose up --build`. Stop with `Ctrl+C`; data is kept in a Docker volume.

Common Docker errors:

| Error | Cause and fix |
|---|---|
| `unknown instruction: PK` | Docker was given a `.zip` as the Dockerfile. Unzip the project and run from the unzipped folder. |
| `"/public": not found` | You ran the build from a folder that does not contain `public/`. Use `bash start.sh docker`, which switches to the right folder itself. |
| `Cannot connect to the Docker daemon` | Docker Desktop is not running. Open it and wait until it says it is running. |
| `port is already allocated` | Something else uses port 3000. Stop it, or change `"3000:3000"` in `docker-compose.yml` to `"3001:3000"` and open port 3001. |
