"""
Configuration file for Sabong Declarator
Edit these values to match your credentials
"""
import os

# ============ DEPLOYMENT MODE ============
# Auto-detect Railway environment
RAILWAY_ENVIRONMENT = os.environ.get('RAILWAY_ENVIRONMENT', None)
IS_PRODUCTION = RAILWAY_ENVIRONMENT is not None or os.environ.get('PRODUCTION', 'false').lower() == 'true'

# Set to True for server deployment (uses stealth headless browser)
# Set to False for local development (uses off-screen visible browser)
# Automatically True on Railway
HEADLESS_MODE = IS_PRODUCTION or os.environ.get('HEADLESS', 'false').lower() == 'true'

# ============ WCC CREDENTIALS ============
WCC_USERNAME = os.environ.get('WCC_USERNAME', 'ajoaquin')
WCC_PASSWORD = os.environ.get('WCC_PASSWORD', 'Noobness1')

# URLs
WCC_LOGIN_URL = "https://www.wccgames8.xyz/en/login"
WCC_STREAM_URL = "https://stream.wccgames7.xyz/wccstream/streams/live.m3u8"

# Legacy Pisoperya (backup)
PISOPERYA_PHONE = "09306236460"
PISOPERYA_PASSWORD = "Noobness1"
PISOPERYA_ARENA_ID = "112"
PISOPERYA_LOGIN_URL = "https://pisoperya.app/login"
PISOPERYA_PLAY_URL = f"https://pisoperya.app/play/{PISOPERYA_ARENA_ID}"

# Server Settings
HOST = "0.0.0.0"
PORT = int(os.environ.get('PORT', 8000))

# CORS - Allow frontend URLs
_frontend_url = os.environ.get('FRONTEND_URL', '')
CORS_ORIGINS = [
    "http://localhost:3000", 
    "http://127.0.0.1:3000", 
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
# Add production frontend URL if set
if _frontend_url:
    CORS_ORIGINS.append(_frontend_url)
    # Also allow without trailing slash
    CORS_ORIGINS.append(_frontend_url.rstrip('/'))
