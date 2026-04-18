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

DEFAULT_PROJECT_ID=12345
DEFAULT_REPORT_ID=67890
DEFAULT_DOMAIN=example.com
DEFAULT_BRAND_NAME=Example Corp
DEFAULT_COUNTRY=us
DEFAULT_COMPETITORS_DOMAINS=competitor1.com,competitor2.com
CRON_SCHEDULE=0 2 * * *
```

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

All configuration lives in `.env`. There is no in-app settings editor for global values — restart the server after changing `.env`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `AHREFS_API_KEY` | Yes | — | Ahrefs API v3 key |
| `PORT` | No | `3000` | HTTP server port |
| `TIMEOUT_MS` | No | `30000` | API request timeout in milliseconds |
| `DB_PATH` | No | `./analytics.db` | Path to the SQLite database file |
| `DEFAULT_PROJECT_ID` | No | — | Ahrefs project ID for GSC and Rank Tracker widgets |
| `DEFAULT_WEB_ANALYTICS_PROJECT_ID` | No | — | Ahrefs project ID for Web Analytics widgets (falls back to `DEFAULT_PROJECT_ID` if unset) |
| `DEFAULT_REPORT_ID` | No | — | Brand Radar report ID |
| `DEFAULT_DOMAIN` | No | — | Your domain (used by Site Explorer and competitor filtering) |
| `DEFAULT_BRAND_NAME` | No | — | Brand name for filtering branded keywords in GSC |
| `DEFAULT_COUNTRY` | No | `us` | Country code for SERP lookups (ISO 2-letter) |
| `DEFAULT_COMPETITORS_DOMAINS` | No | — | Comma-separated competitor domains to exclude from tables |
| `CRON_SCHEDULE` | No | `0 2 * * *` | Cron expression for scheduled data refresh |

## Per-Widget Overrides (via Settings UI)

Open the Settings panel from the dashboard to set per-widget `project_id`, `report_id`, or `brand` overrides that take precedence over the `.env` defaults for that specific widget.

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
