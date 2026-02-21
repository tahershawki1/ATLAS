# Atlas Site - Project Structure

## 📂 Folder Structure

```
ATLAS SITE/
├── web/                    # 🌐 Web App (PWA) - Cloudflare Pages
│   ├── index.html          # Main HTML
│   ├── app.js              # App logic
│   ├── style.css           # Styles
│   ├── sites_data.js       # Sites database
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service Worker (offline + updates)
│   └── icons/              # App icons (192x192, 512x512)
│
├── mobile/                 # 📱 Mobile App Shell (Capacitor)
│   └── (will be initialized with Capacitor)
│
├── sites_raw.txt           # Raw site data (source)
└── parse_sites.py          # Data parser script
```

## 🔄 Workflow

### Web Development (web/)

1. Edit files in `web/` folder
2. Push to GitHub
3. Cloudflare Pages auto-deploys
4. Users see "Update Available" notification

### Mobile App (mobile/)

1. Capacitor wraps the `web/` content
2. Build APK for Android distribution
3. App loads `web/` content locally (offline)
4. Checks Cloudflare for updates when online

## 🚀 Deployment

- **Web**: Cloudflare Pages (auto-deploy from GitHub)
- **Mobile**: APK via Capacitor (manual distribution)
