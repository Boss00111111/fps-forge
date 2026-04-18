# FPS Forge Licensing + Admin

## 1) Start license server

```bash
cd license-server
npm install
set ADMIN_TOKEN=change_me_super_secret
npm start
```

Linux/macOS:

```bash
export ADMIN_TOKEN=change_me_super_secret
npm start
```

## 2) Configure desktop app

Set one of:

- env var: `FPSFORGE_LICENSE_API=https://your-domain`
- or `%AppData%/FPS Forge/license-api.json`:

```json
{ "apiBase": "https://your-domain" }
```

## 3) Generate 100 sellable keys

```bash
npm run keys:gen
```

Outputs:

- `license-server/keys.json` (server catalog)
- `license-server/output/keys.csv`
- `~/OneDrive/Dokumente/Boost-PC-license-100-keys.csv`

## 4) Admin endpoints

Use header `x-admin-token: <ADMIN_TOKEN>`.

Admin panel (browser):

- Open `https://your-license-server/admin-panel`
- Enter API base + token
- View activations, reset key, create keys

### List used keys

`GET /admin/activations`

### Reset one key (unbind from PC)

`POST /admin/reset`

```json
{ "key": "FFG-XXXX-XXXX-XXXX-XXXX" }
```

### Create new keys (e.g. monthly)

`POST /admin/create`

```json
{
  "count": 10,
  "tier": "premium_monthly",
  "daysValid": 30
}
```

Tiers:

- `free`
- `premium_monthly`
- `premium_lifetime`

## 5) Premium behavior in app

- Free key: basic features (dashboard, temp cleanup)
- Premium keys (`premium_monthly`, `premium_lifetime`): boost, stream mode, max fps, security scan, vpn integrations
