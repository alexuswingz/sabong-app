"""
Pisoperya Browser Automation Module
Uses Playwright to automate login and stream access
Captures the actual HLS stream URL for embedding
"""

import asyncio
import re
from typing import Optional, Callable, List
from playwright.async_api import async_playwright, Browser, Page, BrowserContext, Request

from config import (
    PISOPERYA_PHONE, PISOPERYA_PASSWORD, PISOPERYA_ARENA_ID,
    WCC_USERNAME, WCC_PASSWORD, WCC_LOGIN_URL, WCC_STREAM_URL
)

class PisoperyaAutomation:
    def __init__(self):
        # Pisoperya credentials (legacy)
        self.phone = PISOPERYA_PHONE
        self.password = PISOPERYA_PASSWORD
        self.arena_id = PISOPERYA_ARENA_ID
        
        # WCC credentials
        self.wcc_username = WCC_USERNAME
        self.wcc_password = WCC_PASSWORD
        self.wcc_login_url = WCC_LOGIN_URL
        self.wcc_stream_url = WCC_STREAM_URL
        
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
        
        # Common args for both modes
        common_args = [
            '--autoplay-policy=no-user-gesture-required',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
        ]
        
        if headless:
            # STEALTH HEADLESS MODE - for deployment
            # These flags help avoid detection
            stealth_args = common_args + [
                '--disable-blink-features=AutomationControlled',
                '--disable-features=VizDisplayCompositor',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run',
                '--safebrowsing-disable-auto-update',
            ]
            self.browser = await self.playwright.chromium.launch(
                headless=True,
                args=stealth_args
            )
        else:
            # LOCAL MODE - off-screen window (won't be visible)
            local_args = common_args + [
                '--disable-blink-features=AutomationControlled',
                '--window-position=-2000,-2000',  # Move window off-screen
                '--window-size=800,600',
            ]
            self.browser = await self.playwright.chromium.launch(
                headless=False,
                args=local_args
            )
        
        # Create context with viewport and permissions
        self.context = await self.browser.new_context(
            viewport={'width': 1280, 'height': 720},
            permissions=['geolocation'],
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            locale='en-US',
            timezone_id='Asia/Manila',
        )
        
        self.page = await self.context.new_page()
        
        # STEALTH: Inject scripts to avoid bot detection
        await self.page.add_init_script("""
            // Override webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
            
            // Override permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // Override chrome runtime
            window.chrome = {
                runtime: {}
            };
            
            // Remove automation indicators
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
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
    
    async def login_wcc(self) -> bool:
        """Login to WCC Games (Official Site)"""
        if not self.page:
            await self.start_browser()
        
        try:
            print("🔐 Navigating to WCC login page...")
            await self.page.goto(self.wcc_login_url, wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(3)  # Wait for page to fully render
            
            # Step 1: Click the first login button to open the form
            print("🖱️ Opening login form...")
            try:
                # Try multiple selectors
                first_login_btn = self.page.locator('button:has-text("Login"), button:has-text("LOGIN")').first
                await first_login_btn.wait_for(state="visible", timeout=10000)
                await first_login_btn.click()
            except:
                # Fallback: try any button in the section
                first_login_btn = self.page.locator('section button').first
                await first_login_btn.click()
            await asyncio.sleep(2)
            
            # Step 2: Fill username - wait for input to be ready
            print("👤 Entering username...")
            username_input = self.page.locator('input[autocomplete="username"], input[placeholder*="username" i], input[type="text"]').first
            await username_input.wait_for(state="visible", timeout=10000)
            await username_input.click()
            await asyncio.sleep(0.2)
            await username_input.fill(self.wcc_username)
            await asyncio.sleep(0.5)
            
            # Step 3: Fill password
            print("🔑 Entering password...")
            password_input = self.page.locator('input[type="password"]').first
            await password_input.wait_for(state="visible", timeout=5000)
            await password_input.click()
            await asyncio.sleep(0.2)
            await password_input.fill(self.wcc_password)
            await asyncio.sleep(0.5)
            
            # Step 4: Click LOGIN submit button
            print("🖱️ Clicking LOGIN button...")
            login_submit = self.page.locator('button[type="submit"]:has-text("LOGIN"), button.bg-red:has-text("LOGIN")').first
            await login_submit.wait_for(state="visible", timeout=5000)
            await login_submit.click()
            
            print("⏳ Waiting for login to complete...")
            await asyncio.sleep(5)  # Give more time for login to process
            
            # Step 5: Close any popup that appears
            print("🔄 Checking for popups...")
            try:
                close_btn = self.page.locator('i.mdi-close, button:has(i.mdi-close), .v-dialog button').first
                if await close_btn.is_visible(timeout=3000):
                    await close_btn.click()
                    print("✅ Popup closed")
                    await asyncio.sleep(1)
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
                await self.page.screenshot(path="login_error.png")
                print("📸 Screenshot saved to login_error.png")
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
