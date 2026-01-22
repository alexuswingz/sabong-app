"""
Cookie Sync Script - Runs on YOUR PC
Automatically logs into WCC, extracts cookies, and pushes to Railway
Run this in the background while developing

Usage:
    python sync_cookies.py

It will:
1. Log into WCC using your credentials
2. Extract all cookies (including session cookies)
3. Push them to your Railway backend
4. Repeat every 4 hours (or when cookies expire)
"""

import asyncio
import json
import os
import sys
from datetime import datetime

# Add parent directory for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

try:
    from playwright.async_api import async_playwright
    import httpx
except ImportError:
    print("Installing required packages...")
    os.system("pip install playwright httpx")
    os.system("playwright install chromium")
    from playwright.async_api import async_playwright
    import httpx


def load_config():
    """Load configuration from config.txt or use defaults"""
    config = {
        'RAILWAY_BACKEND': 'https://YOUR-APP.up.railway.app',
        'WCC_USERNAME': '',
        'WCC_PASSWORD': '',
        'REFRESH_HOURS': 4
    }
    
    config_path = os.path.join(os.path.dirname(__file__), 'config.txt')
    
    if os.path.exists(config_path):
        print(f"📄 Loading config from: config.txt")
        with open(config_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    config[key.strip()] = value.strip()
    else:
        print(f"⚠️ No config.txt found, using defaults")
        print(f"   Create config.txt to customize settings")
    
    # Environment variables override config file
    config['RAILWAY_BACKEND'] = os.environ.get('RAILWAY_BACKEND', config['RAILWAY_BACKEND'])
    config['WCC_USERNAME'] = os.environ.get('WCC_USERNAME', config['WCC_USERNAME'])
    config['WCC_PASSWORD'] = os.environ.get('WCC_PASSWORD', config['WCC_PASSWORD'])
    
    return config


# Load configuration
CONFIG = load_config()

# =============================================================================
# CONFIGURATION VALUES (loaded from config.txt)
# =============================================================================

WCC_USERNAME = CONFIG['WCC_USERNAME']
WCC_PASSWORD = CONFIG['WCC_PASSWORD']
WCC_LOGIN_URL = "https://www.wccgames8.xyz/"
RAILWAY_BACKEND = CONFIG['RAILWAY_BACKEND']
REFRESH_INTERVAL = int(CONFIG.get('REFRESH_HOURS', 4)) * 60 * 60

# =============================================================================


async def login_and_get_cookies():
    """Login to WCC and extract all cookies"""
    print(f"\n{'='*50}")
    print(f"🕐 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"🔐 Logging into WCC...")
    
    async with async_playwright() as p:
        # Launch browser (visible so you can see what's happening)
        browser = await p.chromium.launch(
            headless=False,  # Set to True to run in background
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
            ]
        )
        
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 720},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        
        page = await context.new_page()
        
        try:
            # Go to WCC
            print(f"📍 Navigating to {WCC_LOGIN_URL}")
            await page.goto(WCC_LOGIN_URL, wait_until='networkidle', timeout=60000)
            await asyncio.sleep(2)
            
            # Check if already logged in
            if await page.query_selector('text=Logout') or await page.query_selector('text=logout'):
                print("✅ Already logged in!")
            else:
                # Find and click login button
                print("🔍 Looking for login button...")
                login_btn = await page.query_selector('button:has-text("Login")') or \
                           await page.query_selector('a:has-text("Login")') or \
                           await page.query_selector('[class*="login"]')
                
                if login_btn:
                    await login_btn.click()
                    await asyncio.sleep(2)
                
                # Fill credentials
                print("📝 Entering credentials...")
                
                # Try different username selectors
                username_input = await page.query_selector('input[name="username"]') or \
                                await page.query_selector('input[type="text"]') or \
                                await page.query_selector('input[placeholder*="user" i]')
                
                if username_input:
                    await username_input.fill(WCC_USERNAME)
                    await asyncio.sleep(0.5)
                
                # Try different password selectors
                password_input = await page.query_selector('input[name="password"]') or \
                                await page.query_selector('input[type="password"]')
                
                if password_input:
                    await password_input.fill(WCC_PASSWORD)
                    await asyncio.sleep(0.5)
                
                # Submit
                submit_btn = await page.query_selector('button[type="submit"]') or \
                            await page.query_selector('button:has-text("Sign In")') or \
                            await page.query_selector('button:has-text("Login")')
                
                if submit_btn:
                    await submit_btn.click()
                    print("⏳ Waiting for login...")
                    await asyncio.sleep(5)
            
            # Navigate to live stream page to get stream cookies
            print("📺 Going to live stream page...")
            await page.goto("https://www.wccgames8.xyz/live/sabong", wait_until='networkidle', timeout=60000)
            await asyncio.sleep(3)
            
            # Get all cookies
            cookies = await context.cookies()
            print(f"🍪 Extracted {len(cookies)} cookies")
            
            # Convert to simple dict
            cookie_dict = {}
            for cookie in cookies:
                cookie_dict[cookie['name']] = cookie['value']
                print(f"   - {cookie['name']}: {cookie['value'][:30]}...")
            
            await browser.close()
            return cookie_dict
            
        except Exception as e:
            print(f"❌ Error during login: {e}")
            await browser.close()
            return None


async def test_cookies_on_railway(cookies: dict) -> bool:
    """Test if cookies work on Railway BEFORE replacing current ones"""
    print(f"\n🧪 Testing cookies on Railway (without replacing)...")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RAILWAY_BACKEND}/stream/test-cookies",
                json={"cookies": json.dumps(cookies)},
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    print(f"✅ Cookies validated: {result.get('message', 'Valid')}")
                    return True
                else:
                    print(f"⚠️ Cookies invalid: {result.get('error', 'Unknown error')}")
                    return False
            else:
                print(f"⚠️ Test endpoint failed: {response.status_code}")
                # Fallback - push anyway if test endpoint doesn't exist
                return True
                
    except Exception as e:
        print(f"⚠️ Could not test cookies: {e}")
        # Fallback - push anyway
        return True


async def push_cookies_to_railway(cookies: dict, force: bool = False):
    """Push cookies to Railway backend
    
    Args:
        cookies: Dict of cookies to push
        force: If True, skip validation and push anyway
    """
    # First, test the cookies (unless forced)
    if not force:
        is_valid = await test_cookies_on_railway(cookies)
        if not is_valid:
            print(f"⚠️ New cookies failed validation!")
            print(f"   Current stream may still be working with old cookies.")
            print(f"   Skipping push to avoid breaking the stream.")
            return False
    
    print(f"\n📤 Pushing validated cookies to Railway...")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RAILWAY_BACKEND}/stream/set-cookies",
                json={"cookies": json.dumps(cookies)},
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Success! {result.get('message', 'Cookies pushed')}")
                return True
            else:
                print(f"❌ Failed: {response.status_code} - {response.text}")
                return False
                
    except Exception as e:
        print(f"❌ Error pushing cookies: {e}")
        return False


async def verify_stream():
    """Verify the stream is working and show health status"""
    print(f"\n🔍 Verifying stream status...")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{RAILWAY_BACKEND}/stream/status",
                timeout=30
            )
            
            if response.status_code == 200:
                status = response.json()
                if status.get('authenticated'):
                    cookies_count = status.get('cookies_count', 0)
                    cookies_age = status.get('cookies_age', 'unknown')
                    cookies_health = status.get('cookies_health', 'unknown')
                    has_backup = status.get('has_backup_cookies', False)
                    
                    health_emoji = {
                        'fresh': '🟢',
                        'good': '🟢', 
                        'aging': '🟡',
                        'stale': '🔴',
                        'unknown': '⚪'
                    }.get(cookies_health, '⚪')
                    
                    print(f"✅ Stream is LIVE!")
                    print(f"   Cookies: {cookies_count}")
                    print(f"   Age: {cookies_age}")
                    print(f"   Health: {health_emoji} {cookies_health}")
                    print(f"   Backup: {'Yes' if has_backup else 'No'}")
                    return True
                else:
                    print("❌ Stream not authenticated")
                    return False
            else:
                print(f"❌ Status check failed: {response.status_code}")
                return False
                
    except Exception as e:
        print(f"❌ Error checking stream: {e}")
        return False


async def main():
    """Main loop - sync cookies periodically"""
    print("")
    print("=" * 60)
    print("  🚀 WCC Cookie Sync Script")
    print("=" * 60)
    print(f"  Username:  {WCC_USERNAME or '(NOT SET)'}")
    print(f"  Railway:   {RAILWAY_BACKEND}")
    print(f"  Refresh:   Every {REFRESH_INTERVAL // 3600} hours")
    print("=" * 60)
    
    # Validate configuration
    errors = []
    if not WCC_USERNAME or WCC_USERNAME == '':
        errors.append("WCC_USERNAME is not set")
    if not WCC_PASSWORD or WCC_PASSWORD == '':
        errors.append("WCC_PASSWORD is not set")
    if 'YOUR-' in RAILWAY_BACKEND or not RAILWAY_BACKEND.startswith('http'):
        errors.append("RAILWAY_BACKEND URL is not configured")
    
    if errors:
        print("")
        print("  ❌ CONFIGURATION ERRORS:")
        for err in errors:
            print(f"     - {err}")
        print("")
        print("  📝 Edit config.txt with your settings:")
        print(f"     {os.path.join(os.path.dirname(__file__), 'config.txt')}")
        print("")
        print("=" * 60)
        input("  Press Enter to exit...")
        return
    
    print("")
    print("  📝 Edit config.txt to change these settings")
    print("")
    print("  Press Ctrl+C to stop")
    print("=" * 60)
    print("")
    
    while True:
        try:
            # Login and get cookies
            cookies = await login_and_get_cookies()
            
            if cookies and len(cookies) > 0:
                # Push to Railway
                success = await push_cookies_to_railway(cookies)
                
                if success:
                    # Verify it worked
                    await asyncio.sleep(2)
                    await verify_stream()
            else:
                print("❌ No cookies extracted")
            
            # Wait for next refresh
            print(f"\n⏰ Next refresh in {REFRESH_INTERVAL // 3600} hours...")
            print(f"   (or press Ctrl+C to stop)")
            await asyncio.sleep(REFRESH_INTERVAL)
            
        except KeyboardInterrupt:
            print("\n\n👋 Stopped by user")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")
            print("Retrying in 5 minutes...")
            await asyncio.sleep(300)


if __name__ == "__main__":
    asyncio.run(main())
