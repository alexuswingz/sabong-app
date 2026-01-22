# 🐓 Sabong Declarator

A private entertainment app for watching sabong with friends. Features automated browser login and a declarator system for managing betting among friends.

## 🚀 Quick Start

### Option 1: One-Click Start (Recommended)
1. Double-click `start-all.bat` to start both backend and frontend
2. Wait for both servers to start
3. Open http://localhost:5173 in your browser

### Option 2: Manual Start
**Terminal 1 - Backend:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
python server.py
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## 📋 Features

### 🤖 Browser Automation
- **Start Browser**: Launches Chrome browser with automation
- **Login**: Automatically logs into Pisoperya with saved credentials
- **Go to Arena**: Navigates to the live stream page

### 🎤 Declarator Controls
- **Open Betting**: Opens betting for current fight
- **Last Call**: Countdown timer before closing
- **Close Betting**: Closes betting
- **Declare Winner**: Meron/Wala/Draw/Cancelled
- **Reset**: Move to next fight

### 💰 Betting System
- Add bets with name and amount
- Track Meron vs Wala totals
- See all current bets
- Fight history

### 🎵 Sound & Voice
- Sound effects for each action
- Voice announcements
- Toggle on/off

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `O` | Open Betting |
| `L` | Last Call |
| `C` | Close Betting |
| `M` | Meron Wins |
| `W` | Wala Wins |
| `D` | Draw |
| `R` | Reset/Next Fight |

## ⚙️ Configuration

For **local development**, edit `backend/config.py` or set environment variables.

For **Railway deployment**, set these environment variables in Railway dashboard:
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Railway)
- `WCC_USERNAME` - Your WCC login username
- `WCC_PASSWORD` - Your WCC login password

> ⚠️ **IMPORTANT**: Never commit credentials to git! Use environment variables.

## 🚀 Railway Deployment

When deployed to Railway, the WCC site blocks headless browsers due to bot protection.

**Solution: Cookie Sync Script**

1. Deploy your app to Railway normally
2. On your **local PC**, run the cookie sync script:
   ```
   cd cookie-sync
   RUN_SYNC.bat
   ```
3. The script will:
   - Open a visible browser (passes bot checks)
   - Login to WCC automatically
   - Push cookies to your Railway backend
   - Repeat every 4 hours

4. **Keep the script running** while your app is live!

Edit `cookie-sync/config.txt` to set your Railway URL:
```
RAILWAY_BACKEND=https://your-app.up.railway.app
WCC_USERNAME=your_username
WCC_PASSWORD=your_password
```

## 🔧 Requirements

- **Python 3.9+** - For backend server
- **Node.js 18+** - For frontend
- **Chrome browser** - For automation

## 📁 Project Structure

```
sabong-app/
├── backend/
│   ├── automation.py    # Playwright browser automation
│   ├── server.py        # FastAPI server with WebSocket
│   ├── config.py        # Configuration settings
│   └── requirements.txt # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx      # Main React component
│   │   └── App.css      # Styles
│   └── package.json     # Node dependencies
├── start-all.bat        # Start both servers
├── start-backend.bat    # Start backend only
├── start-frontend.bat   # Start frontend only
└── README.md
```

## 🔒 Privacy Notice

This app is for **PRIVATE ENTERTAINMENT ONLY** among friends. It does not facilitate real money gambling. The betting system is just for fun tracking among your group.

## 🛠️ Troubleshooting

### Browser won't start
- Make sure Chrome is installed
- Run `playwright install chromium` in the backend folder

### Can't connect to backend
- Make sure the backend server is running on port 8000
- Check for firewall issues

### Login fails
- Verify credentials in `config.py`
- The site structure might have changed - check the automation selectors

## 📝 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/automation/start` | Start browser |
| POST | `/automation/login` | Login to Pisoperya |
| POST | `/automation/goto-arena` | Navigate to arena |
| POST | `/automation/stop` | Stop browser |
| POST | `/betting/open` | Open betting |
| POST | `/betting/last-call` | Trigger last call |
| POST | `/betting/close` | Close betting |
| POST | `/betting/add` | Add a bet |
| POST | `/fight/declare-winner` | Declare winner |
| POST | `/fight/reset` | Reset for next fight |
| WS | `/ws` | WebSocket for real-time updates |

---

**Have fun with your friends! 🐓**
