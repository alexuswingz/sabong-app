# 🚀 Railway Deployment Guide

## Step 1: Create Railway Project

1. Go to [railway.app](https://railway.app) and login
2. Click **"New Project"**
3. Select **"Empty Project"**

---

## Step 2: Add PostgreSQL Database

1. In your project, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Wait for it to provision
4. Click on the database → **"Variables"** tab
5. Copy the `DATABASE_URL` value

---

## Step 3: Deploy Backend

1. Click **"+ New"** → **"GitHub Repo"**
2. Select your repo, set **Root Directory** to: `sabong-app/backend`
3. Go to **"Variables"** tab and add:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | (paste from PostgreSQL) |
| `WCC_USERNAME` | your_wcc_username |
| `WCC_PASSWORD` | your_wcc_password |
| `FRONTEND_URL` | (add after frontend deploy) |

4. Go to **"Settings"** tab:
   - Generate a domain (e.g., `sabong-backend-xxx.up.railway.app`)
   - Note this URL for frontend config

---

## Step 4: Deploy Frontend

1. Click **"+ New"** → **"GitHub Repo"** (same repo)
2. Set **Root Directory** to: `sabong-app/frontend`
3. Go to **"Variables"** tab and add:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://your-backend-xxx.up.railway.app` |
| `VITE_WS_URL` | `wss://your-backend-xxx.up.railway.app/ws` |

4. Go to **"Settings"** tab:
   - Generate a domain (e.g., `sabong-frontend-xxx.up.railway.app`)

---

## Step 5: Update Backend CORS

Go back to your **Backend** service → **Variables** and update:

| Variable | Value |
|----------|-------|
| `FRONTEND_URL` | `https://sabong-frontend-xxx.up.railway.app` |

---

## Step 6: Redeploy

After adding all variables:
1. Backend: Click **"Deploy"** → **"Redeploy"**
2. Frontend: Click **"Deploy"** → **"Redeploy"**

---

## 🎉 Done!

Your app should now be live at:
- **Frontend**: `https://sabong-frontend-xxx.up.railway.app`
- **Backend API**: `https://sabong-backend-xxx.up.railway.app`

---

## Environment Variables Summary

### Backend Variables
```
DATABASE_URL=postgresql://...
WCC_USERNAME=your_username
WCC_PASSWORD=your_password
FRONTEND_URL=https://your-frontend.up.railway.app
PORT=8000
```

### Frontend Variables
```
VITE_API_URL=https://your-backend.up.railway.app
VITE_WS_URL=wss://your-backend.up.railway.app/ws
```

---

## Troubleshooting

### Stream not working?
- Check backend logs for auto-login status
- Ensure WCC credentials are correct
- The browser may need 30-60 seconds to login on first deploy

### WebSocket connection failed?
- Make sure `VITE_WS_URL` uses `wss://` (not `ws://`)
- Check CORS - `FRONTEND_URL` must match exactly

### Build failed?
- Backend: Playwright/Chromium needs ~500MB RAM
- Frontend: Check for TypeScript/lint errors
