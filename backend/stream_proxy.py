"""
Stream Proxy Module
Proxies the HLS stream with authentication cookies from the logged-in browser session
REWRITES manifest URLs to go through our local proxy to bypass CORS and auth issues
"""

import os
import asyncio
import re
from typing import Optional, Dict
from urllib.parse import urljoin, urlparse, quote
import httpx

from config import WCC_STREAM_URL

# Get the backend URL from environment or use localhost for dev
BACKEND_URL = os.environ.get('RAILWAY_PUBLIC_DOMAIN', os.environ.get('BACKEND_URL', ''))


class StreamProxy:
    def __init__(self):
        self.cookies: Dict[str, str] = {}
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
        """Initialize the HTTP client"""
        if self.client is None:
            self.client = httpx.AsyncClient(
                timeout=30.0,
                follow_redirects=True,
                verify=False  # Some streaming servers have SSL issues
            )
    
    async def stop(self):
        """Close the HTTP client"""
        if self.client:
            await self.client.aclose()
            self.client = None
    
    def set_cookies_from_browser(self, cookies: list):
        """Extract cookies from Playwright browser context"""
        self.cookies = {}
        for cookie in cookies:
            self.cookies[cookie['name']] = cookie['value']
        self.is_authenticated = len(self.cookies) > 0
        print(f"📦 Loaded {len(self.cookies)} cookies from browser")
    
    def set_cookies_dict(self, cookies: Dict[str, str]):
        """Set cookies from a dictionary"""
        self.cookies = cookies
        self.is_authenticated = len(self.cookies) > 0
    
    def set_cookies_from_string(self, cookies: Dict[str, str]):
        """Set cookies from a parsed cookie string dictionary"""
        self.cookies = cookies
        self.is_authenticated = len(self.cookies) > 0
        print(f"📦 Loaded {len(self.cookies)} cookies from manual input")
    
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
        """Fetch the HLS manifest (.m3u8) file and rewrite URLs"""
        await self.start()
        
        target_url = url or WCC_STREAM_URL
        
        try:
            print(f"📡 Fetching manifest from: {target_url}")
            response = await self.client.get(
                target_url,
                headers=self.headers,
                cookies=self.cookies
            )
            
            if response.status_code == 200:
                content = response.content.decode('utf-8')
                print(f"✅ Manifest fetched, {len(content)} bytes")
                
                # IMPORTANT: Rewrite URLs to go through our proxy!
                rewritten = self.rewrite_manifest_urls(content, target_url)
                print(f"✅ Manifest URLs rewritten for proxy")
                
                return rewritten
            else:
                print(f"❌ Manifest fetch failed: {response.status_code}")
                print(f"   Response: {response.text[:500]}")
                return None
                
        except Exception as e:
            print(f"❌ Error fetching manifest: {e}")
            return None
    
    async def fetch_segment(self, url: str) -> Optional[bytes]:
        """Fetch a video segment (.ts file) or any other resource"""
        await self.start()
        
        try:
            print(f"📥 Fetching segment: {url[-50:]}")  # Last 50 chars for readability
            response = await self.client.get(
                url,
                headers=self.headers,
                cookies=self.cookies
            )
            
            if response.status_code == 200:
                return response.content
            else:
                print(f"❌ Segment fetch failed: {response.status_code} for {url}")
                return None
                
        except Exception as e:
            print(f"❌ Error fetching segment: {e}")
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
