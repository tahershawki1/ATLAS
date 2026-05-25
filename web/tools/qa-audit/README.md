# QA Audit Tools

## Commands
- `npm run dev:qa-local`: starts local server in QA mode (`atlas_local_mode=1`, default local password)
- `npm run qa:audit`: runs route + responsive + console + redirect-intent audit on local + production
- `npm run qa:audit:local`: local only
- `npm run qa:audit:production`: production only (guest mode by default)

## Production authenticated run
Set credentials before running production audit:
- `ATLAS_QA_PROD_USER`
- `ATLAS_QA_PROD_PASSWORD`

Example (PowerShell):
```powershell
$env:ATLAS_QA_PROD_USER='qa_user'
$env:ATLAS_QA_PROD_PASSWORD='***'
npm.cmd run qa:audit:production
```

## Outputs
All artifacts are written to `audit-artifacts/`:
- `atlas-qa-audit-results.json`
- `atlas-qa-audit-summary.json`
- screenshots per route/viewport
