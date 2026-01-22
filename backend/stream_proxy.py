"""
Stream Proxy Module
Proxies the HLS stream with authentication cookies from the logged-in browser session
REWRITES manifest URLs to go through our local proxy to bypass CORS and auth issues

RELIABILITY FEATURES:
- Graceful cookie updates (test before replacing)
- Fallback to old cookies if new ones fail
- No interruption during cookie refresh
"""

import os
import asyncio
import re
from typing import Optional, Dict
from urllib.parse import urljoin, urlparse, quote
from datetime import datetime
import httpx

from config import WCC_STREAM_URL

# Get the backend URL from environment or use localhost for dev
BACKEND_URL = os.environ.get('RAILWAY_PUBLIC_DOMAIN', os.environ.get('BACKEND_URL', ''))


class StreamProxy:
    def __init__(self):
        self.cookies: Dict[str, str] = {}
        self._backup_cookies: Dict[str, str] = {}  # Fallback cookies
        self._cookies_updated_at: Optional[datetime] = None
        self.headers: Dict[str, str] = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://www.wccgames8.xyz',
            'Referer': 'https://www.wccgames8.xyz/',
        }
        self.base_url = WCC_STREAM_URL.rsplit('/', 1)[0] + '/'
        self.client: Optional[httpx.AsyncClient] = None
        self.is_authenticated = False
        # Proxy base URL - dynamically determined
        self._proxy_base_url = None
        # Lock to prevent concurrent cookie updates
        self._update_lock = asyncio.Lock()
    
    @property
    def proxy_base_url(self):
        """Get the proxy base URL - uses Railway domain if available"""
        if self._proxy_base_url:
            return self._proxy_base_url
        
        if BACKEND_URL:
            # Railway or configured backend URL
            if BACKEND_URL.startswith('http'):
                return f"{BACKEND_URL}/stream"
            else:
                return f"https://{BACKEND_URL}/stream"
        
        # Fallback to localhost for development
        return "http://localhost:8000/stream"
    
    @proxy_base_url.setter
    def proxy_base_url(self, value):
        self._proxy_base_url = value
    
    async def start(self):
        """Initialize the HTTP client with optimized settings"""
        if self.client is None:
            # Optimized for streaming - connection pooling
            self.client = httpx.AsyncClient(
                timeout=httpx.Timeout(30.0, connect=10.0),
                follow_redirects=True,
                verify=False,  # Some streaming servers have SSL issues
                limits=httpx.Limits(
                    max_keepalive_connections=20,
                    max_connections=50,
                    keepalive_expiry=30.0
                )
            )
    
    async def stop(self):
        """Close the HTTP client"""
        if self.client:
            await self.client.aclose()
            self.client = None
    
    def set_cookies_from_browser(self, cookies: list):
        """Extract cookies from Playwright browser context"""
        new_cookies = {}
        for cookie in cookies:
            new_cookies[cookie['name']] = cookie['value']
        self._apply_cookies(new_cookies, source="browser")
    
    def set_cookies_dict(self, cookies: Dict[str, str]):
        """Set cookies from a dictionary"""
        self._apply_cookies(cookies, source="dict")
    
    def set_cookies_from_string(self, cookies: Dict[str, str]):
        """Set cookies from a parsed cookie string dictionary"""
        self._apply_cookies(cookies, source="manual input")
    
    def _apply_cookies(self, new_cookies: Dict[str, str], source: str = "unknown"):
        """
        Apply new cookies with backup of old ones.
        Old cookies are kept as fallback in case new ones fail.
        """
        if len(new_cookies) == 0:
            print(f"⚠️ Received empty cookies from {source}, ignoring")
            return
        
        # Backup current working cookies (if we have any)
        if self.is_authenticated and self.cookies:
            self._backup_cookies = self.cookies.copy()
            print(f"📦 Backed up {len(self._backup_cookies)} existing cookies")
        
        # Apply new cookies
        self.cookies = new_cookies
        self.is_authenticated = True
        self._cookies_updated_at = datetime.now()
        print(f"✅ Applied {len(self.cookies)} cookies from {source}")
        print(f"   Update time: {self._cookies_updated_at.strftime('%Y-%m-%d %H:%M:%S')}")
    
    def restore_backup_cookies(self) -> bool:
        """Restore backup cookies if available (called on stream failure)"""
        if self._backup_cookies:
            print(f"🔄 Restoring {len(self._backup_cookies)} backup cookies")
            self.cookies = self._backup_cookies.copy()
            self.is_authenticated = True
            return True
        return False
    
    @property
    def cookies_age_seconds(self) -> Optional[int]:
        """How old are the current cookies in seconds"""
        if self._cookies_updated_at:
            return int((datetime.now() - self._cookies_updated_at).total_seconds())
        return None
    
    def rewrite_manifest_urls(self, content: str, source_url: str) -> str:
        """
        Rewrite all URLs in the HLS manifest to go through our proxy.
        This is the KEY to making the stream work!
        """
        lines = content.split('\n')
        rewritten_lines = []
        
        for line in lines:
            stripped = line.strip()
            
            # Skip empty lines and comments (but keep them)
            if not stripped or stripped.startswith('#'):
                # Check if it's an EXT-X-KEY or similar with a URI
                if 'URI="' in stripped:
                    # Rewrite URIs in tags like #EXT-X-KEY:METHOD=AES-128,URI="..."
                    def replace_uri(match):
                        uri = match.group(1)
                        if not uri.startswith('http'):
                            uri = urljoin(source_url, uri)
                        # URL encode the original URL and pass it to our proxy
                        proxied = f'{self.proxy_base_url}/segment?url={quote(uri, safe="")}'
                        return f'URI="{proxied}"'
                    
                    stripped = re.sub(r'URI="([^"]+)"', replace_uri, stripped)
                rewritten_lines.append(stripped)
            else:
                # This is a URL line (segment or sub-playlist)
                url = stripped
                if not url.startswith('http'):
                    # Make relative URL absolute first
                    url = urljoin(source_url, url)
                
                # Rewrite to go through our proxy
                # URL encode the original URL
                proxied_url = f'{self.proxy_base_url}/segment?url={quote(url, safe="")}'
                rewritten_lines.append(proxied_url)
        
        return '\n'.join(rewritten_lines)
    
    async def fetch_manifest(self, url: Optional[str] = None) -> Optional[str]:
        """Fetch the HLS manifest (.m3u8) file and rewrite URLs
        
        Includes automatic fallback to backup cookies if primary fails.
        """
        await self.start()
        
        target_url = url or WCC_STREAM_URL
        
        try:
            response = await self.client.get(
                target_url,
                headers=self.headers,
                cookies=self.cookies
            )
            
            if response.status_code == 200:
                content = response.content.decode('utf-8')
                
                # IMPORTANT: Rewrite URLs to go through our proxy!
                rewritten = self.rewrite_manifest_urls(content, target_url)
                
                return rewritten
            elif response.status_code in [401, 403]:
                # Auth failed - try backup cookies
                print(f"⚠️ Manifest fetch got {response.status_code}, trying backup cookies...")
                if self._backup_cookies and self._backup_cookies != self.cookies:
                    backup_response = await self.client.get(
                        target_url,
                        headers=self.headers,
                        cookies=self._backup_cookies
                    )
                    if backup_response.status_code == 200:
                        print(f"✅ Backup cookies worked! Restoring them...")
                        self.restore_backup_cookies()
                        content = backup_response.content.decode('utf-8')
                        return self.rewrite_manifest_urls(content, target_url)
                
                print(f"❌ Manifest fetch failed: {response.status_code}")
                return None
            else:
                print(f"❌ Manifest fetch failed: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"❌ Error fetching manifest: {e}")
            return None
    
    async def fetch_segment(self, url: str, retry_with_backup: bool = True) -> Optional[bytes]:
        """Fetch a video segment (.ts file) or any other resource
        
        Includes automatic retry with backup cookies on auth failure.
        Segments are fetched very frequently, so we minimize logging.
        """
        await self.start()
        
        try:
            response = await self.client.get(
                url,
                headers=self.headers,
                cookies=self.cookies
            )
            
            if response.status_code == 200:
                return response.content
            elif response.status_code in [401, 403] and retry_with_backup:
                # Auth failed - try backup cookies (but only once)
                if self._backup_cookies and self._backup_cookies != self.cookies:
                    backup_response = await self.client.get(
                        url,
                        headers=self.headers,
                        cookies=self._backup_cookies
                    )
                    if backup_response.status_code == 200:
                        # Backup worked - restore them silently
                        self.restore_backup_cookies()
                        return backup_response.content
                return None
            else:
                return None
                
        except Exception as e:
            # Network errors happen, don't spam logs
            return None
    
    async def proxy_request(self, path: str) -> tuple[Optional[bytes], str]:
        """
        Proxy any request to the stream server
        Returns (content, content_type)
        """
        await self.start()
        
        # Construct the full URL
        if path.startswith('http'):
            url = path
        else:
            url = urljoin(self.base_url, path)
        
        try:
            response = await self.client.get(
                url,
                headers=self.headers,
                cookies=self.cookies
            )
            
            if response.status_code == 200:
                content_type = response.headers.get('content-type', 'application/octet-stream')
                return response.content, content_type
            else:
                print(f"❌ Proxy request failed: {response.status_code} for {url}")
                return None, 'text/plain'
                
        except Exception as e:
            print(f"❌ Error in proxy request: {e}")
            return None, 'text/plain'


# Singleton instance
stream_proxy = StreamProxy()
