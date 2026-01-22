"""
Configuration file for Sabong Declarator

IMPORTANT: For production, set ALL credentials as environment variables in Railway!

Required Environment Variables:
  - DATABASE_URL: PostgreSQL connection string
  - WCC_USERNAME: WCC login username
  - WCC_PASSWORD: WCC login password
  - PROXY_URL: Residential proxy (REQUIRED for Railway deployment)

For Scale (1000+ users):
  - STREAM_MODE: 'direct' (default) or 'proxy'
  - DIRECT_STREAM_URL: Direct stream URL (users connect directly, saves bandwidth)
  - PUSHER_* or ABLY_*: For WebSocket scaling
"""
import os

# ============ DEPLOYMENT MODE ============
RAILWAY_ENVIRONMENT = os.environ.get('RAILWAY_ENVIRONMENT', None)
IS_PRODUCTION = RAILWAY_ENVIRONMENT is not None or os.environ.get('PRODUCTION', 'false').lower() == 'true'
# With xvfb virtual display, we can run headless=False even in production
# This bypasses headless browser detection
HEADLESS_MODE = os.environ.get('HEADLESS', 'false').lower() == 'true'

# ============ WCC CREDENTIALS ============
WCC_USERNAME = os.environ.get('WCC_USERNAME', '')
WCC_PASSWORD = os.environ.get('WCC_PASSWORD', '')

# ============ RESIDENTIAL PROXY ============
PROXY_URL = os.environ.get('PROXY_URL', '')

# ============ STREAM SCALING ============
# 'direct' = Users connect directly to stream URL (scalable, recommended)
# 'proxy' = Stream goes through your server (limited to ~50 users)
STREAM_MODE = os.environ.get('STREAM_MODE', 'direct')

# For direct mode: The actual stream URL users will connect to
# This can be a CDN URL for better performance
DIRECT_STREAM_URL = os.environ.get('DIRECT_STREAM_URL', '')

# ============ WEBSOCKET SCALING (for 1000+ users) ============
# Use Pusher or Ably for massive scale WebSocket
PUSHER_APP_ID = os.environ.get('PUSHER_APP_ID', '')
PUSHER_KEY = os.environ.get('PUSHER_KEY', '')
PUSHER_SECRET = os.environ.get('PUSHER_SECRET', '')
PUSHER_CLUSTER = os.environ.get('PUSHER_CLUSTER', 'ap1')

# Max WebSocket connections on this server (0 = unlimited, but risky)
MAX_WEBSOCKET_CONNECTIONS = int(os.environ.get('MAX_WEBSOCKET_CONNECTIONS', '500'))

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
