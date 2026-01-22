"""
Pisoperya Browser Automation Module
Uses Playwright to automate login and stream access
Captures the actual HLS stream URL for embedding
"""

import asyncio
import re
from typing import Optional, Callable, List
from playwright.async_api import async_playwright, Browser, Page, BrowserContext, Request

import os
from config import (
    PISOPERYA_PHONE, PISOPERYA_PASSWORD, PISOPERYA_ARENA_ID,
    WCC_USERNAME, WCC_PASSWORD, WCC_LOGIN_URL, WCC_STREAM_URL
)

# Proxy support - REQUIRED for Railway deployment to bypass bot protection
# Format: http://user:pass@host:port
from config import IS_PRODUCTION
PROXY_URL = os.environ.get('PROXY_URL', '')

class PisoperyaAutomation:
    def __init__(self):
        # Pisoperya credentials (legacy)
        self.phone = PISOPERYA_PHONE
        self.password = PISOPERYA_PASSWORD
        self.arena_id = PISOPERYA_ARENA_ID
        
        # WCC credentials - check if configured
        self.wcc_username = WCC_USERNAME
        self.wcc_password = WCC_PASSWORD
        self.wcc_login_url = WCC_LOGIN_URL
        self.wcc_stream_url = WCC_STREAM_URL
        
        # Warn if credentials not set
        if not self.wcc_username or not self.wcc_password:
            print("⚠️ WARNING: WCC_USERNAME and/or WCC_PASSWORD not set in environment variables!")
        
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.playwright = None
        self.is_logged_in = False
        self.stream_url: Optional[str] = None
        self.hls_url: Optional[str] = WCC_STREAM_URL  # Default to known stream URL
        self.captured_urls: List[str] = [WCC_STREAM_URL]  # Pre-populate with known URL
        self.on_status_change: Optional[Callable] = None
        self.on_stream_found: Optional[Callable] = None
        self.site_type: str = "wcc"  # "wcc" or "pisoperya"
        
    async def start_browser(self, headless: bool = True):
        """Start the browser instance
        
        For deployment (headless=True): Uses stealth headless mode
        For local dev (headless=False): Uses off-screen window
        """
        print(f"🚀 Starting browser (headless={headless})...")
        self.playwright = await async_playwright().start()
        
        # Common args for both modes - enhanced stealth
        common_args = [
            '--autoplay-policy=no-user-gesture-required',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-blink-features=AutomationControlled',
        ]
        
        if headless:
            # STEALTH HEADLESS MODE - use "new" headless for better stealth
            stealth_args = common_args + [
                '--disable-features=VizDisplayCompositor',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--no-first-run',
                '--safebrowsing-disable-auto-update',
                '--disable-hang-monitor',
                '--disable-ipc-flooding-protection',
                '--disable-popup-blocking',
                '--disable-prompt-on-repost',
                '--disable-renderer-backgrounding',
                '--force-color-profile=srgb',
            ]
            # Use "new" headless mode - less detectable than old headless
            # headless="new" runs a full browser in headless mode (undetectable)
            self.browser = await self.playwright.chromium.launch(
                headless="new",  # New headless mode - undetectable
                args=stealth_args,
                chromium_sandbox=False
            )
        else:
            # LOCAL MODE - off-screen window (won't be visible)
            local_args = common_args + [
                '--window-position=-2000,-2000',
                '--window-size=800,600',
            ]
            self.browser = await self.playwright.chromium.launch(
                headless=False,
                args=local_args
            )
        
        # Randomize viewport slightly for fingerprint uniqueness
        import random
        viewport_width = 1280 + random.randint(-20, 20)
        viewport_height = 720 + random.randint(-10, 10)
        
        # Build context options with more realistic fingerprint
        context_options = {
            'viewport': {'width': viewport_width, 'height': viewport_height},
            'permissions': ['geolocation'],
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'locale': 'en-PH',
            'timezone_id': 'Asia/Manila',
            'color_scheme': 'light',
            'device_scale_factor': 1,
            'has_touch': False,
            'is_mobile': False,
            'java_script_enabled': True,
            'accept_downloads': False,
            'extra_http_headers': {
                'Accept-Language': 'en-PH,en-US;q=0.9,en;q=0.8',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'max-age=0',
                'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
            }
        }
        
        # Add proxy if configured - REQUIRED for production to bypass bot protection
        if PROXY_URL:
            # Parse proxy URL: http://user:pass@host:port
            from urllib.parse import urlparse
            parsed = urlparse(PROXY_URL)
            
            proxy_config = {
                'server': f'{parsed.scheme}://{parsed.hostname}:{parsed.port}'
            }
            
            # Add credentials if present
            if parsed.username and parsed.password:
                proxy_config['username'] = parsed.username
                proxy_config['password'] = parsed.password
            
            print(f"🌐 Using residential proxy: {parsed.hostname}:{parsed.port}")
            context_options['proxy'] = proxy_config
        elif IS_PRODUCTION:
            print("⚠️ WARNING: No PROXY_URL configured! Bot protection will likely block login.")
            print("   Add a residential proxy to Railway environment variables.")
            print("   Recommended: IPRoyal (~$7/GB) or Smartproxy (~$12/GB)")
        
        # Create context with viewport and permissions
        self.context = await self.browser.new_context(**context_options)
        
        self.page = await self.context.new_page()
        
        # STEALTH: Inject comprehensive anti-detection scripts
        await self.page.add_init_script("""
            // Override webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            // Make plugins look real
            Object.defineProperty(navigator, 'plugins', {
                get: () => {
                    const plugins = [
                        {name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer'},
                        {name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai'},
                        {name: 'Native Client', filename: 'internal-nacl-plugin'}
                    ];
                    plugins.item = (i) => plugins[i];
                    plugins.namedItem = (name) => plugins.find(p => p.name === name);
                    plugins.refresh = () => {};
                    return plugins;
                }
            });
            
            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-PH', 'en-US', 'en']
            });
            
            // Make permissions API look normal
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // Override chrome runtime to look real
            window.chrome = {
                runtime: {
                    PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
                    PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
                    PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
                    RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
                    OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
                    OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' }
                },
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };
            
            // Remove automation indicators
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
            
            // Override toString to hide modifications
            const originalToString = Function.prototype.toString;
            Function.prototype.toString = function() {
                if (this === navigator.permissions.query) {
                    return 'function query() { [native code] }';
                }
                return originalToString.call(this);
            };
            
            // Add realistic screen properties
            Object.defineProperty(screen, 'availWidth', { get: () => window.innerWidth });
            Object.defineProperty(screen, 'availHeight', { get: () => window.innerHeight });
            
            // Spoof WebGL vendor and renderer
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) return 'Intel Inc.';
                if (parameter === 37446) return 'Intel Iris OpenGL Engine';
                return getParameter.call(this, parameter);
            };
            
            // Override connection type
            Object.defineProperty(navigator, 'connection', {
                get: () => ({
                    effectiveType: '4g',
                    rtt: 50,
                    downlink: 10,
                    saveData: false
                })
            });
        """)
        
        # Set up network request interception to capture stream URLs
        self.page.on("request", self._on_request)
        self.page.on("response", self._on_response)
        
        print("✅ Browser started successfully")
        print("🔍 Network monitoring enabled - will capture stream URLs")
        return True
    
    def _on_request(self, request: Request):
        """Monitor requests to find stream URLs"""
        url = request.url
        
        # Look for HLS/m3u8 streams
        if '.m3u8' in url or 'stream' in url.lower():
            if url not in self.captured_urls:
                self.captured_urls.append(url)
                print(f"📡 Found stream URL: {url[:100]}...")
                
                # Prioritize m3u8 URLs
                if '.m3u8' in url:
                    self.hls_url = url
                    print(f"✅ HLS Stream captured: {url}")
                    if self.on_stream_found:
                        asyncio.create_task(self.on_stream_found(url))
    
    async def _on_response(self, response):
        """Monitor responses for stream data"""
        url = response.url
        content_type = response.headers.get('content-type', '')
        
        # Check for HLS playlist
        if 'mpegurl' in content_type or 'application/vnd.apple.mpegurl' in content_type:
            if url not in self.captured_urls:
                self.captured_urls.append(url)
                self.hls_url = url
                print(f"✅ HLS Stream from response: {url}")
    
    async def login(self) -> bool:
        """Login to Pisoperya (legacy)"""
        if not self.page:
            await self.start_browser()
        
        try:
            print("🔐 Navigating to login page...")
            await self.page.goto("https://pisoperya.app/login", wait_until="networkidle")
            await asyncio.sleep(2)
            
            # Fill phone number
            print("📱 Entering phone number...")
            phone_input = self.page.locator('input[type="text"], input[type="tel"]').first
            await phone_input.fill(self.phone)
            await asyncio.sleep(0.5)
            
            # Fill password
            print("🔑 Entering password...")
            password_input = self.page.locator('input[type="password"]')
            await password_input.fill(self.password)
            await asyncio.sleep(0.5)
            
            # Click login button
            print("🖱️ Clicking login button...")
            login_button = self.page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first
            await login_button.click()
            
            # Wait for navigation
            print("⏳ Waiting for login to complete...")
            await asyncio.sleep(3)
            
            # Check if logged in by looking for dashboard elements or URL change
            current_url = self.page.url
            if "login" not in current_url.lower() or "dashboard" in current_url.lower():
                self.is_logged_in = True
                self.site_type = "pisoperya"
                print("✅ Login successful!")
                return True
            else:
                print("❌ Login may have failed, checking page...")
                # Try to detect error messages
                error = await self.page.locator('.error, .alert-danger, [class*="error"]').first.text_content()
                if error:
                    print(f"Error: {error}")
                return False
                
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return False
    
    async def _human_type(self, element, text: str):
        """Type text like a human with random delays"""
        import random
        await element.click()
        await asyncio.sleep(random.uniform(0.1, 0.3))
        for char in text:
            await element.type(char, delay=random.randint(50, 150))
            await asyncio.sleep(random.uniform(0.01, 0.05))
    
    async def _random_mouse_move(self):
        """Simulate random mouse movements"""
        import random
        for _ in range(random.randint(2, 5)):
            x = random.randint(100, 1000)
            y = random.randint(100, 600)
            await self.page.mouse.move(x, y)
            await asyncio.sleep(random.uniform(0.1, 0.3))

    async def _wait_for_security_challenge(self, max_wait: int = 30) -> bool:
        """Wait for Vercel/Cloudflare security challenge to complete"""
        import random
        print("🛡️ Checking for security challenge...")
        
        challenge_detected = False
        
        for i in range(max_wait):
            try:
                # Check if page is still valid
                if not self.page or self.page.is_closed():
                    print("⚠️ Page was closed during challenge wait")
                    return False
                
                # Check if there's a security challenge present
                html = await self.page.content()
                
                # More specific Vercel security challenge indicators
                is_challenge = (
                    'vercel-challenge' in html.lower() or 
                    'checking your browser' in html.lower() or
                    '_vercel/insights' in html and 'challenge' in html.lower()
                )
                
                if is_challenge:
                    if not challenge_detected:
                        print("⏳ Security challenge detected, waiting for it to complete...")
                        challenge_detected = True
                    
                    # Simulate human-like behavior while waiting
                    if i % 5 == 0:
                        await self._random_mouse_move()
                    
                    await asyncio.sleep(1)
                    continue
                
                # Check if login form or main page is now visible
                login_btn = self.page.locator('button:has-text("Login"), button:has-text("LOGIN"), a:has-text("Login"), input[type="text"], input[type="password"]')
                if await login_btn.count() > 0:
                    if challenge_detected:
                        print("✅ Security challenge passed!")
                    else:
                        print("✅ No security challenge detected")
                    return True
                
                # If we haven't detected a challenge and no login form, wait a bit
                if not challenge_detected and i < 5:
                    await asyncio.sleep(1)
                    continue
                    
                # If no challenge and page seems loaded, proceed
                if not challenge_detected:
                    print("✅ Page loaded, no challenge detected")
                    return True
                    
            except Exception as e:
                print(f"⚠️ Challenge check error: {e}")
                pass
            
            await asyncio.sleep(1)
        
        print("⚠️ Security challenge timeout, proceeding anyway...")
        return True

    async def login_wcc(self) -> bool:
        """Login to WCC Games (Official Site) with human-like behavior"""
        import random
        
        # Check if credentials are configured
        if not self.wcc_username or not self.wcc_password:
            print("❌ WCC credentials not configured! Set WCC_USERNAME and WCC_PASSWORD environment variables.")
            return False
        
        if not self.page:
            await self.start_browser()
        
        try:
            print("🔐 Navigating to WCC login page...")
            
            # Random delay before navigation (human-like)
            await asyncio.sleep(random.uniform(0.5, 1.5))
            
            # Navigate and wait for network to be idle (JavaScript fully loaded)
            await self.page.goto(self.wcc_login_url, wait_until="networkidle", timeout=60000)
            
            # Wait for the page to fully load
            await asyncio.sleep(random.uniform(2, 3))
            
            # Wait for security challenge if present (residential proxy should pass faster)
            await self._wait_for_security_challenge(max_wait=45)
            
            # IMPORTANT: Wait for JavaScript to render the login form
            print("⏳ Waiting for login form to render...")
            try:
                # Wait for any input field to appear (form rendered)
                await self.page.wait_for_selector('input', state='visible', timeout=30000)
                print("✅ Form inputs detected!")
            except:
                print("⚠️ No inputs found after 30s, trying to wait more...")
                await asyncio.sleep(5)
            
            # Additional wait for page to stabilize
            await asyncio.sleep(random.uniform(1, 2))
            await self._random_mouse_move()
            
            # Take debug screenshot of the page
            try:
                await self.page.screenshot(path="page_loaded.png")
                print("📸 Debug screenshot saved to page_loaded.png")
            except:
                pass
            
            # Check if we're on a login page (URL contains 'login')
            current_url = self.page.url
            print(f"📍 Current URL: {current_url}")
            
            # If URL already has 'login', form should be visible - no need to click button
            if 'login' in current_url.lower():
                print("✅ Already on login page, looking for form...")
            else:
                # Try to click login button to open form
                print("🖱️ Opening login form...")
                login_btn_found = False
                
                login_selectors = [
                    'button:has-text("Login")',
                    'button:has-text("LOGIN")', 
                    'a:has-text("Login")',
                    'a:has-text("LOGIN")',
                    '[class*="login"]',
                    'button:has-text("Sign In")',
                    'header button',
                    'nav button',
                ]
                
                for selector in login_selectors:
                    try:
                        btn = self.page.locator(selector).first
                        if await btn.is_visible(timeout=3000):
                            await asyncio.sleep(random.uniform(0.3, 1))
                            await btn.click()
                            login_btn_found = True
                            print(f"✅ Clicked login button using: {selector}")
                            break
                    except:
                        continue
                
                if not login_btn_found:
                    print("⚠️ Could not find login button, page may already show login form...")
            
            await asyncio.sleep(random.uniform(1, 2))
            await self._random_mouse_move()
            
            # Step 2: Fill username - wait for input with multiple selector attempts
            print("👤 Looking for username input...")
            
            # First, let's see all visible inputs on the page for debugging
            try:
                all_inputs = await self.page.locator('input').all()
                print(f"📋 Found {len(all_inputs)} input fields on page")
                for i, inp in enumerate(all_inputs[:5]):  # Show first 5
                    try:
                        inp_type = await inp.get_attribute('type') or 'unknown'
                        inp_name = await inp.get_attribute('name') or 'no-name'
                        inp_placeholder = await inp.get_attribute('placeholder') or 'no-placeholder'
                        is_visible = await inp.is_visible()
                        print(f"   Input {i}: type={inp_type}, name={inp_name}, placeholder={inp_placeholder}, visible={is_visible}")
                    except:
                        pass
            except Exception as e:
                print(f"⚠️ Could not list inputs: {e}")
            
            username_selectors = [
                'input[autocomplete="username"]',
                'input[placeholder*="username" i]',
                'input[placeholder*="Username" i]',
                'input[placeholder*="user" i]',
                'input[placeholder*="email" i]',
                'input[name="username"]',
                'input[name="userName"]',
                'input[name="email"]',
                'input[type="text"]:visible',
                'input[type="email"]:visible',
                'form input:first-of-type',
                'input:visible',
            ]
            
            username_input = None
            for selector in username_selectors:
                try:
                    input_el = self.page.locator(selector).first
                    if await input_el.is_visible(timeout=5000):
                        username_input = input_el
                        print(f"✅ Found username input using: {selector}")
                        break
                except:
                    continue
            
            if not username_input:
                # Last resort - find any visible text input
                username_input = self.page.locator('input:visible').first
                await username_input.wait_for(state="visible", timeout=20000)
            
            await asyncio.sleep(random.uniform(0.3, 0.8))
            
            # Human-like typing with clear first
            await username_input.click()
            await asyncio.sleep(random.uniform(0.1, 0.3))
            await username_input.fill('')  # Clear any existing text
            await self._human_type(username_input, self.wcc_username)
            await asyncio.sleep(random.uniform(0.5, 1))
            
            # Step 3: Fill password
            print("🔑 Entering password...")
            password_input = self.page.locator('input[type="password"]:visible').first
            await password_input.wait_for(state="visible", timeout=15000)
            await asyncio.sleep(random.uniform(0.3, 0.8))
            
            # Human-like typing
            await password_input.click()
            await asyncio.sleep(random.uniform(0.1, 0.3))
            await self._human_type(password_input, self.wcc_password)
            await asyncio.sleep(random.uniform(0.5, 1.5))
            
            # Random mouse movement before clicking submit
            await self._random_mouse_move()
            
            # Step 4: Click LOGIN submit button
            print("🖱️ Clicking LOGIN button...")
            submit_selectors = [
                'button[type="submit"]',
                'button:has-text("LOGIN")',
                'button:has-text("Login")',
                'button:has-text("Log In")',
                'button:has-text("Sign In")',
                'form button',
                'input[type="submit"]',
            ]
            
            for selector in submit_selectors:
                try:
                    btn = self.page.locator(selector).first
                    if await btn.is_visible(timeout=3000):
                        await asyncio.sleep(random.uniform(0.3, 0.8))
                        await btn.click()
                        print(f"✅ Clicked submit using: {selector}")
                        break
                except:
                    continue
            
            print("⏳ Waiting for login to complete...")
            await asyncio.sleep(random.uniform(6, 10))  # Give more time for login to process
            
            # Check if we're logged in by looking for dashboard elements
            try:
                # Look for elements that indicate successful login
                dashboard_selectors = [
                    'text=Dashboard',
                    'text=Balance',
                    'text=ARENA',
                    'text=ENTER ARENA',
                    'text=Logout',
                    'text=Profile',
                    '[class*="balance"]',
                    '[class*="arena"]',
                ]
                
                for selector in dashboard_selectors:
                    try:
                        el = self.page.locator(selector).first
                        if await el.is_visible(timeout=3000):
                            print(f"✅ Dashboard detected ({selector}) - login successful!")
                            break
                    except:
                        continue
            except:
                print("⚠️ Dashboard not clearly detected, checking URL...")
            
            # Step 5: Close any popup that appears
            print("🔄 Checking for popups...")
            await asyncio.sleep(random.uniform(1, 2))
            try:
                popup_close_selectors = [
                    'i.mdi-close',
                    'button:has(i.mdi-close)',
                    '.v-dialog button',
                    'button[aria-label="Close"]',
                    '.close-btn',
                    '[class*="close"]',
                    'button:has-text("×")',
                    'button:has-text("X")',
                ]
                
                for selector in popup_close_selectors:
                    try:
                        close_btn = self.page.locator(selector).first
                        if await close_btn.is_visible(timeout=2000):
                            await asyncio.sleep(random.uniform(0.3, 0.8))
                            await close_btn.click()
                            print("✅ Popup closed")
                            await asyncio.sleep(1)
                            break
                    except:
                        continue
            except:
                print("ℹ️ No popup found (or already closed)")
            
            self.is_logged_in = True
            self.site_type = "wcc"
            print("✅ WCC Login successful!")
            return True
                
        except Exception as e:
            print(f"❌ WCC Login error: {str(e)}")
            # Take screenshot for debugging
            try:
                await self.page.screenshot(path="login_error.png", full_page=True)
                print("📸 Screenshot saved to login_error.png")
                # Also save the page HTML for debugging
                html = await self.page.content()
                with open("login_error.html", "w", encoding="utf-8") as f:
                    f.write(html)
                print("📄 HTML saved to login_error.html")
            except:
                pass
            return False
    
    async def enter_wcc_arena(self) -> bool:
        """Enter the WCC cockpit arena"""
        if not self.page:
            return False
        
        try:
            print("🎮 Looking for ENTER ARENA button...")
            
            # Try to find and click the ENTER ARENA button
            enter_btn = self.page.locator('button').filter(has_text="ENTER ARENA")
            if not await enter_btn.is_visible(timeout=3000):
                # Try alternative selectors
                enter_btn = self.page.locator('button.bg-red-600, button:has-text("ENTER")')
            
            if await enter_btn.is_visible():
                await enter_btn.click()
                print("✅ Clicked ENTER ARENA")
                await asyncio.sleep(3)
                
                # The stream URL should now be available
                self.hls_url = self.wcc_stream_url
                print(f"📡 Stream URL: {self.hls_url}")
                return True
            else:
                print("❌ ENTER ARENA button not found")
                return False
                
        except Exception as e:
            print(f"❌ Enter arena error: {str(e)}")
            return False
    
    async def get_cookies(self) -> list:
        """Get all cookies from the browser context"""
        if not self.context:
            return []
        return await self.context.cookies()
    
    async def navigate_to_arena(self) -> bool:
        """Navigate to the live stream arena"""
        if not self.is_logged_in:
            success = await self.login()
            if not success:
                return False
        
        try:
            play_url = f"https://pisoperya.app/play/{self.arena_id}"
            print(f"🎮 Navigating to arena: {play_url}")
            await self.page.goto(play_url, wait_until="networkidle")
            await asyncio.sleep(3)
            
            # Try to find and click on the arena image/button if needed
            try:
                arena_selector = f'img[src*="arena"], a[href*="/play/{self.arena_id}"], [class*="arena"]'
                arena_element = self.page.locator(arena_selector).first
                if await arena_element.is_visible():
                    await arena_element.click()
                    await asyncio.sleep(2)
            except:
                pass
            
            self.stream_url = play_url
            print("✅ Arena loaded successfully!")
            return True
            
        except Exception as e:
            print(f"❌ Navigation error: {str(e)}")
            return False
    
    async def get_video_source(self) -> Optional[str]:
        """Try to extract the video stream source"""
        # First, return captured HLS URL if available
        if self.hls_url:
            return self.hls_url
        
        if not self.page:
            return None
            
        try:
            # Try to find video element and get its source
            video = self.page.locator('video')
            if await video.count() > 0:
                src = await video.first.get_attribute('src')
                if src and not src.startswith('blob:'):
                    return src
                    
                # Check for source elements inside video
                source = self.page.locator('video source')
                if await source.count() > 0:
                    src = await source.first.get_attribute('src')
                    if src and not src.startswith('blob:'):
                        return src
            
            # Try to find iframe with video
            iframe = self.page.locator('iframe')
            if await iframe.count() > 0:
                return await iframe.first.get_attribute('src')
                
        except Exception as e:
            print(f"Could not extract video source: {e}")
        
        return None
    
    async def get_stream_url(self) -> Optional[str]:
        """Get the captured HLS stream URL"""
        return self.hls_url
    
    async def get_all_captured_urls(self) -> List[str]:
        """Get all captured stream-related URLs"""
        return self.captured_urls
    
    async def find_stream_url_from_page(self) -> Optional[str]:
        """Try to extract stream URL using JavaScript"""
        if not self.page:
            return None
        
        try:
            # Try to get the video.js player source
            stream_url = await self.page.evaluate('''() => {
                // Try video.js player
                const player = document.querySelector('.video-js');
                if (player && player.player) {
                    const src = player.player.currentSrc();
                    if (src && !src.startsWith('blob:')) return src;
                }
                
                // Try getting from video element's srcObject
                const video = document.querySelector('video');
                if (video) {
                    // Check if there's an HLS.js instance
                    if (window.Hls && window.Hls.DefaultConfig) {
                        // Look for hls instance
                        for (let key in window) {
                            if (window[key] && window[key].url) {
                                return window[key].url;
                            }
                        }
                    }
                    
                    // Check video src
                    if (video.src && !video.src.startsWith('blob:')) {
                        return video.src;
                    }
                    
                    // Check currentSrc
                    if (video.currentSrc && !video.currentSrc.startsWith('blob:')) {
                        return video.currentSrc;
                    }
                }
                
                // Look for any m3u8 URLs in script tags or inline scripts
                const scripts = document.querySelectorAll('script');
                for (let script of scripts) {
                    const text = script.textContent || script.innerHTML;
                    const match = text.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
                    if (match) return match[0];
                }
                
                // Look for stream URLs in network requests stored somewhere
                const allElements = document.querySelectorAll('*');
                for (let el of allElements) {
                    for (let attr of el.attributes) {
                        if (attr.value && attr.value.includes('.m3u8')) {
                            const match = attr.value.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
                            if (match) return match[0];
                        }
                    }
                }
                
                return null;
            }''')
            
            if stream_url:
                self.hls_url = stream_url
                print(f"✅ Found stream URL from page: {stream_url}")
                return stream_url
                
        except Exception as e:
            print(f"Could not find stream URL from page: {e}")
        
        return self.hls_url
    
    async def get_current_fight_info(self) -> dict:
        """Try to extract current fight information from the page"""
        info = {
            "fight_number": None,
            "meron_odds": None,
            "wala_odds": None,
            "status": None
        }
        
        if not self.page:
            return info
            
        try:
            # These selectors might need adjustment based on actual page structure
            # Try to find fight number
            fight_text = await self.page.locator('[class*="fight"], [class*="Fight"]').first.text_content()
            if fight_text:
                import re
                match = re.search(r'(\d+)', fight_text)
                if match:
                    info["fight_number"] = int(match.group(1))
            
            # Try to find betting status
            status_element = self.page.locator('[class*="status"], [class*="Status"]')
            if await status_element.count() > 0:
                info["status"] = await status_element.first.text_content()
                
        except Exception as e:
            print(f"Could not extract fight info: {e}")
        
        return info
    
    async def take_screenshot(self, path: str = "screenshot.png"):
        """Take a screenshot of the current page"""
        if self.page:
            await self.page.screenshot(path=path)
            print(f"📸 Screenshot saved to {path}")
    
    async def close(self):
        """Close the browser"""
        print("🔄 Closing browser...")
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        print("✅ Browser closed")


# Singleton instance
automation = PisoperyaAutomation()


async def main():
    """Test the automation"""
    auto = PisoperyaAutomation()
    
    try:
        await auto.start_browser(headless=False)
        await auto.login()
        await auto.navigate_to_arena()
        
        # Keep browser open for viewing
        print("\n🎬 Stream is ready! Press Ctrl+C to close.")
        while True:
            await asyncio.sleep(1)
            
    except KeyboardInterrupt:
        print("\n👋 Shutting down...")
    finally:
        await auto.close()


if __name__ == "__main__":
    asyncio.run(main())
