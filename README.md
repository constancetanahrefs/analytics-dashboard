# Analytics Dashboard

A self-hosted analytics dashboard powered by the [Ahrefs API v3](https://ahrefs.com/api). Tracks AI search visibility, organic SEO performance, and content opportunities across multiple data sources.

## Features

- **Performance tab** — Share of Voice over time (AI + Organic), GSC impressions/clicks, top pages in AI Overviews, top organic pages
- **Opportunities tab** — Question keywords, long-tail keywords, PAA questions, discussions, Reddit/Quora citations, video citations
- **Starred tab** — Pin any widget for quick access
- **Settings panel** — Configure Ahrefs project IDs, brand name, competitor domains, and per-widget overrides
- **Scheduled sync** — Configurable cron schedule to refresh all widget data automatically

## Prerequisites

- **Node.js 18+** (required for native `fetch` and ES modules)
- An **Ahrefs API v3** key with access to: Brand Radar, Rank Tracker, GSC, Web Analytics

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/analytics-dashboard.git
cd analytics-dashboard
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
AHREFS_API_KEY=your_api_key_here
PORT=3000
TIMEOUT_MS=30000
DB_PATH=./analytics.db
```

> The API key can also be set (or changed) from the Settings panel in the UI after first run.

### 3. Start the server

```bash
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

The database is created automatically on first run — no manual setup needed.

### Development mode (auto-restart on file changes)

```bash
npm run dev
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AHREFS_API_KEY` | Yes | — | Ahrefs API v3 key |
| `PORT` | No | `3000` | HTTP server port |
| `TIMEOUT_MS` | No | `30000` | API request timeout in milliseconds |
| `DB_PATH` | No | `./analytics.db` | Path to the SQLite database file |

## Configuration (via Settings UI)

Open the Settings panel from the dashboard to configure:

| Setting | Description |
|---|---|
| Default Project ID | Rank Tracker / GSC / Web Analytics project ID |
| Default Report ID | Brand Radar report ID |
| Default Domain | Site Explorer target domain |
| Brand Name | Used to filter branded keywords in GSC |
| Default Country | Two-letter country code (e.g. `us`) |
| Competitor Domains | Comma-separated list of competitor domains |
| Cron Schedule | Auto-refresh schedule (cron expression, e.g. `0 2 * * *`) |

## Deploying to a Server

### Using PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # follow the instructions to start on boot
```

### Using a reverse proxy (nginx)

Point your nginx config at `http://localhost:3000` and optionally restrict access with HTTP basic auth since the dashboard has no built-in authentication.

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Stopping the server

The landing page (`/`) has a **Shut down server** button that terminates the process cleanly (localhost only).

## Data & Privacy

- All API responses are cached locally in SQLite — no data leaves your machine except to the Ahrefs API.
- The database file (`analytics.db`) is excluded from git and should not be committed.
- Your API key is stored in the database after first use and is never returned to the browser in plaintext.
