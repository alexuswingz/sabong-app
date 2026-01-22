"""
FastAPI Server with WebSocket for Sabong Declarator
Handles browser automation and real-time communication with frontend
"""

import sys
import os

# Fix Windows console encoding for emojis
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    os.environ['PYTHONIOENCODING'] = 'utf-8'

import asyncio
import json
from datetime import datetime
from typing import List, Dict, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import httpx

from automation import PisoperyaAutomation
from stream_proxy import stream_proxy
from config import (
    HOST, PORT, CORS_ORIGINS, WCC_STREAM_URL, HEADLESS_MODE, IS_PRODUCTION, 
    PROXY_URL, WCC_USERNAME, STREAM_MODE, DIRECT_STREAM_URL, MAX_WEBSOCKET_CONNECTIONS
)
import database as db

# Global state
class AppState:
    def __init__(self):
        self.automation: Optional[PisoperyaAutomation] = None
        self.connected_clients: List[WebSocket] = []
        self.current_fight: int = 1
        self.betting_status: str = "waiting"  # waiting, open, lastcall, closed
        self.bets: List[Dict] = []
        self.history: List[Dict] = []
        self.stream_delay: int = 5
        self.last_call_time: int = 10
        self.is_browser_running: bool = False
        self.is_logged_in: bool = False

state = AppState()


async def auto_login_wcc():
    """Automatically login to WCC and set up stream proxy"""
    max_retries = 3
    
    # Check configuration first
    if not WCC_USERNAME:
        print("❌ Cannot auto-login: WCC_USERNAME not configured")
        print("   Set WCC_USERNAME and WCC_PASSWORD in Railway environment variables")
        return
    
    if IS_PRODUCTION and not PROXY_URL:
        print("⚠️ WARNING: Running in production without PROXY_URL")
        print("   Bot protection will likely block login attempts!")
        print("   Add a residential proxy to bypass this:")
        print("   - IPRoyal: ~$7/GB - https://iproyal.com")
        print("   - Smartproxy: ~$12/GB - https://smartproxy.com")
    
    for attempt in range(max_retries):
        try:
            print(f"🤖 Auto-login starting... (attempt {attempt + 1}/{max_retries})")
            
            # Close existing browser if any
            if state.automation:
                try:
                    await state.automation.close()
                except:
                    pass
            
            # Start browser
            # HEADLESS_MODE from config: True for deployment, False for local
            state.automation = PisoperyaAutomation()
            await state.automation.start_browser(headless=HEADLESS_MODE)
            state.is_browser_running = True
            print(f"✅ Browser started (headless={HEADLESS_MODE})")
            
            # Login to WCC
            success = await state.automation.login_wcc()
            if success:
                state.is_logged_in = True
                print("✅ Logged into WCC")
                
                # Enter arena
                arena_success = await state.automation.enter_wcc_arena()
                if arena_success:
                    print("✅ Entered arena")
                
                # Extract cookies for stream proxy
                if state.automation.context:
                    cookies = await state.automation.get_cookies()
                    stream_proxy.set_cookies_from_browser(cookies)
                    print(f"✅ Stream proxy ready with {len(cookies)} cookies")
                    print("🎬 Stream available at: http://localhost:8000/stream/live.m3u8")
                    
                    # Broadcast to connected clients
                    await manager.broadcast({
                        "type": "auto_login_complete",
                        "success": True,
                        "proxy_ready": True
                    })
                    return  # Success! Exit the retry loop
            else:
                print(f"❌ Login attempt {attempt + 1} failed")
                
        except Exception as e:
            print(f"❌ Auto-login error (attempt {attempt + 1}): {e}")
        
        # Wait before retrying
        if attempt < max_retries - 1:
            print(f"⏳ Retrying in 5 seconds...")
            await asyncio.sleep(5)
    
    print("❌ All auto-login attempts failed. Use manual login from the UI.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    print("🚀 Sabong Declarator Server Starting...")
    
    # Initialize database
    try:
        await db.init_db()
    except Exception as e:
        print(f"⚠️ Database init failed: {e} - continuing without DB")
    
    # Auto-login to WCC on startup
    asyncio.create_task(auto_login_wcc())
    
    yield
    # Cleanup
    if state.automation:
        await state.automation.close()
    await stream_proxy.stop()
    await db.close_db()
    print("👋 Server shutting down...")


app = FastAPI(
    title="Sabong Declarator API",
    description="Backend for Sabong entertainment system",
    version="1.0.0",
    lifespan=lifespan
)

# CORS - Allow frontend origins + Railway domains in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.up\.railway\.app" if IS_PRODUCTION else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic Models
class BetRequest(BaseModel):
    name: str
    amount: int
    side: str  # "meron" or "wala"
    user_id: Optional[int] = None  # For credit validation


class SettingsUpdate(BaseModel):
    stream_delay: Optional[int] = None
    last_call_time: Optional[int] = None


class WinnerDeclaration(BaseModel):
    winner: str  # "meron", "wala", "draw", "cancelled"


class UserRegister(BaseModel):
    username: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class CreditUpdate(BaseModel):
    user_id: int
    amount: int


class GCashSettings(BaseModel):
    gcash_number: str
    gcash_name: str


class ManualCookies(BaseModel):
    cookies: str  # JSON string of cookies or cookie header string


class CashInRequest(BaseModel):
    amount: int


class CashInAction(BaseModel):
    request_id: int


class CashOutRequest(BaseModel):
    amount: int
    gcash_number: str
    gcash_name: str


# WebSocket Manager
class ConnectionManager:
    async def connect(self, websocket: WebSocket) -> bool:
        """Connect a client. Returns False if limit reached."""
        # Check connection limit
        if MAX_WEBSOCKET_CONNECTIONS > 0 and len(state.connected_clients) >= MAX_WEBSOCKET_CONNECTIONS:
            print(f"⚠️ Connection limit reached ({MAX_WEBSOCKET_CONNECTIONS}). Rejecting new connection.")
            await websocket.close(code=1013, reason="Server at capacity")
            return False
        
        await websocket.accept()
        state.connected_clients.append(websocket)
        print(f"✅ Client connected. Total clients: {len(state.connected_clients)}/{MAX_WEBSOCKET_CONNECTIONS or '∞'}")
        return True
    
    def disconnect(self, websocket: WebSocket):
        if websocket in state.connected_clients:
            state.connected_clients.remove(websocket)
        print(f"👋 Client disconnected. Total clients: {len(state.connected_clients)}")
    
    async def broadcast(self, message: dict):
        """Send message to all connected clients"""
        disconnected = []
        for client in state.connected_clients:
            try:
                await client.send_json(message)
            except:
                disconnected.append(client)
        
        for client in disconnected:
            self.disconnect(client)

manager = ConnectionManager()


async def broadcast_state():
    """Broadcast current state to all clients"""
    await manager.broadcast({
        "type": "state_update",
        "data": {
            "fight_number": state.current_fight,
            "status": state.betting_status,
            "bets": state.bets,
            "history": state.history,
            "stream_delay": state.stream_delay,
            "last_call_time": state.last_call_time,
            "is_browser_running": state.is_browser_running,
            "is_logged_in": state.is_logged_in
        }
    })


# REST Endpoints
@app.get("/")
async def root():
    """API status and configuration check"""
    config_ok = bool(WCC_USERNAME and (PROXY_URL or not IS_PRODUCTION))
    
    return {
        "message": "Sabong Declarator API",
        "status": "running",
        "config": {
            "production_mode": IS_PRODUCTION,
            "headless": HEADLESS_MODE,
            "wcc_credentials": "configured" if WCC_USERNAME else "MISSING",
            "proxy": "configured" if PROXY_URL else ("MISSING - Required for production!" if IS_PRODUCTION else "not needed for local"),
            "config_ok": config_ok
        },
        "stream": {
            "proxy_ready": stream_proxy.is_authenticated,
            "cookies_count": len(stream_proxy.cookies)
        }
    }


@app.get("/config/status")
async def config_status():
    """Check if all required configuration is set"""
    issues = []
    
    if not WCC_USERNAME:
        issues.append("WCC_USERNAME not set")
    if IS_PRODUCTION and not PROXY_URL and STREAM_MODE != 'direct':
        issues.append("PROXY_URL not set (required for Railway deployment to bypass bot protection)")
    if STREAM_MODE == 'direct' and not DIRECT_STREAM_URL:
        issues.append("DIRECT_STREAM_URL not set (required for direct stream mode)")
    
    return {
        "ok": len(issues) == 0,
        "issues": issues,
        "stream_mode": STREAM_MODE,
        "help": {
            "proxy_services": [
                {"name": "IPRoyal", "price": "~$7/GB", "url": "https://iproyal.com"},
                {"name": "Smartproxy", "price": "~$12/GB", "url": "https://smartproxy.com"},
                {"name": "Bright Data", "price": "~$15/GB", "url": "https://brightdata.com"}
            ],
            "env_vars_needed": ["DATABASE_URL", "WCC_USERNAME", "WCC_PASSWORD", "PROXY_URL"],
            "for_scale": ["STREAM_MODE=direct", "DIRECT_STREAM_URL", "MAX_WEBSOCKET_CONNECTIONS"]
        }
    }


@app.get("/stats")
async def get_stats():
    """Get server statistics for monitoring"""
    return {
        "connections": {
            "websocket_clients": len(state.connected_clients),
            "max_allowed": MAX_WEBSOCKET_CONNECTIONS or "unlimited"
        },
        "betting": {
            "current_fight": state.current_fight,
            "status": state.betting_status,
            "active_bets": len(state.bets),
            "meron_total": sum(b["amount"] for b in state.bets if b["side"] == "meron"),
            "wala_total": sum(b["amount"] for b in state.bets if b["side"] == "wala")
        },
        "stream": {
            "mode": STREAM_MODE,
            "proxy_authenticated": stream_proxy.is_authenticated,
            "direct_url_configured": bool(DIRECT_STREAM_URL)
        },
        "automation": {
            "browser_running": state.is_browser_running,
            "logged_in": state.is_logged_in
        }
    }


@app.get("/debug/screenshot")
async def get_debug_screenshot():
    """View the login error screenshot for debugging"""
    import os
    if os.path.exists("login_error.png"):
        from fastapi.responses import FileResponse
        return FileResponse("login_error.png", media_type="image/png")
    return {"error": "No screenshot available"}


@app.get("/debug/html")
async def get_debug_html():
    """View the login error HTML for debugging"""
    import os
    if os.path.exists("login_error.html"):
        with open("login_error.html", "r", encoding="utf-8") as f:
            html = f.read()
        from fastapi.responses import HTMLResponse
        return HTMLResponse(content=html)
    return {"error": "No HTML available"}


@app.get("/status")
async def get_status():
    return {
        "fight_number": state.current_fight,
        "betting_status": state.betting_status,
        "bets_count": len(state.bets),
        "meron_total": sum(b["amount"] for b in state.bets if b["side"] == "meron"),
        "wala_total": sum(b["amount"] for b in state.bets if b["side"] == "wala"),
        "is_browser_running": state.is_browser_running,
        "is_logged_in": state.is_logged_in
    }


# ===== AUTH ENDPOINTS =====
@app.post("/auth/register")
async def register_user(data: UserRegister):
    """Register a new user"""
    if len(data.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    
    user = await db.create_user(data.username, data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    return {
        "success": True,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "credits": user["credits"],
            "is_admin": user["is_admin"]
        }
    }


@app.post("/auth/login")
async def login_user(data: UserLogin):
    """Login a user"""
    user = await db.authenticate_user(data.username, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    return {
        "success": True,
        "user": user
    }


@app.get("/auth/user/{user_id}")
async def get_user(user_id: int):
    """Get user by ID - returns ACTUAL credits from database"""
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.get("/auth/credits/{user_id}")
async def get_user_credits(user_id: int):
    """Get user's ACTUAL credits from database - use this for validation"""
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": user_id, "credits": user.get('credits', 0)}


@app.post("/auth/credits/add")
async def add_user_credits(data: CreditUpdate):
    """Add credits to a user (admin only - no check for now)"""
    new_credits = await db.update_credits(data.user_id, data.amount)
    if new_credits is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "new_credits": new_credits}


@app.post("/auth/credits/set")
async def set_user_credits(data: CreditUpdate):
    """Set user credits to specific amount (admin only)"""
    new_credits = await db.set_credits(data.user_id, data.amount)
    if new_credits is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "new_credits": new_credits}


@app.get("/auth/users")
async def list_all_users():
    """Get all users (admin only)"""
    users = await db.get_all_users()
    return {"users": users}


# ===== GCASH SETTINGS ENDPOINTS =====
@app.get("/gcash/settings")
async def get_gcash_settings():
    """Get GCash settings for Cash In"""
    settings = await db.get_gcash_settings()
    return settings


@app.put("/gcash/settings")
async def update_gcash_settings(data: GCashSettings):
    """Update GCash settings (admin only)"""
    success = await db.update_gcash_settings(data.gcash_number, data.gcash_name)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update settings")
    return {"success": True, "message": "GCash settings updated"}


# ===== CASH IN ENDPOINTS =====
@app.post("/cashin/request")
async def create_cashin_request(data: CashInRequest, user_id: int):
    """Create a cash-in request"""
    if data.amount < 100:
        raise HTTPException(status_code=400, detail="Minimum amount is ₱100")
    if data.amount > 50000:
        raise HTTPException(status_code=400, detail="Maximum amount is ₱50,000")
    
    request = await db.create_cashin_request(user_id, data.amount)
    if not request:
        raise HTTPException(status_code=500, detail="Failed to create request")
    
    # Broadcast to admin
    await manager.broadcast({
        "type": "new_cashin_request",
        "request": request
    })
    
    return {"success": True, "request": request}


@app.get("/cashin/pending")
async def get_pending_cashin():
    """Get pending cash-in requests (admin only)"""
    requests = await db.get_pending_cashin_requests()
    return {"requests": requests}


@app.get("/cashin/user/{user_id}")
async def get_user_cashin(user_id: int):
    """Get cash-in history for a user"""
    requests = await db.get_user_cashin_requests(user_id)
    return {"requests": requests}


@app.post("/cashin/approve")
async def approve_cashin(data: CashInAction, admin_id: int = 1):
    """Approve a cash-in request (admin only)"""
    result = await db.approve_cashin_request(data.request_id, admin_id)
    if not result:
        raise HTTPException(status_code=404, detail="Request not found or already processed")
    
    # Broadcast update
    await manager.broadcast({
        "type": "cashin_approved",
        "user_id": result['user_id'],
        "amount": result['amount'],
        "new_credits": result['new_credits']
    })
    
    return {"success": True, "result": result}


@app.post("/cashin/reject")
async def reject_cashin(data: CashInAction, admin_id: int = 1):
    """Reject a cash-in request (admin only)"""
    success = await db.reject_cashin_request(data.request_id, admin_id)
    if not success:
        raise HTTPException(status_code=404, detail="Request not found or already processed")
    
    return {"success": True}


# ===== CASH OUT ENDPOINTS =====
@app.post("/cashout/request")
async def create_cashout_request(data: CashOutRequest, user_id: int):
    """Create a cash-out request (deducts credits immediately)"""
    if data.amount < 100:
        raise HTTPException(status_code=400, detail="Minimum amount is ₱100")
    if data.amount > 50000:
        raise HTTPException(status_code=400, detail="Maximum amount is ₱50,000")
    if not data.gcash_number or len(data.gcash_number) < 10:
        raise HTTPException(status_code=400, detail="Invalid GCash number")
    if not data.gcash_name or len(data.gcash_name) < 2:
        raise HTTPException(status_code=400, detail="Invalid GCash name")
    
    request = await db.create_cashout_request(user_id, data.amount, data.gcash_number, data.gcash_name)
    if not request:
        raise HTTPException(status_code=400, detail="Insufficient credits or failed to create request")
    
    # Broadcast to staff
    await manager.broadcast({
        "type": "new_cashout_request",
        "request": request
    })
    
    return {"success": True, "request": request}


@app.get("/cashout/pending")
async def get_pending_cashout():
    """Get pending cash-out requests (staff only)"""
    requests = await db.get_pending_cashout_requests()
    return {"requests": requests}


@app.get("/cashout/user/{user_id}")
async def get_user_cashout(user_id: int):
    """Get cash-out history for a user"""
    requests = await db.get_user_cashout_requests(user_id)
    return {"requests": requests}


@app.get("/transactions/{user_id}")
async def get_user_transactions(user_id: int):
    """Get all transaction history for a user (bets, cash-in, cash-out)"""
    transactions = await db.get_user_transactions(user_id)
    return transactions


@app.get("/bets/history/{user_id}")
async def get_user_bet_history(user_id: int):
    """Get betting history for a user"""
    history = await db.get_user_bet_history(user_id)
    return {"history": history}


@app.post("/cashout/approve")
async def approve_cashout(data: CashInAction, staff_id: int = 1):
    """Approve a cash-out request (staff only)"""
    result = await db.approve_cashout_request(data.request_id, staff_id)
    if not result:
        raise HTTPException(status_code=404, detail="Request not found or already processed")
    
    # Broadcast update
    await manager.broadcast({
        "type": "cashout_approved",
        "user_id": result['user_id'],
        "amount": result['amount']
    })
    
    return {"success": True, "result": result}


@app.post("/cashout/reject")
async def reject_cashout(data: CashInAction, staff_id: int = 1):
    """Reject a cash-out request (refunds credits)"""
    result = await db.reject_cashout_request(data.request_id, staff_id)
    if not result:
        raise HTTPException(status_code=404, detail="Request not found or already processed")
    
    # Broadcast update (user gets refund)
    await manager.broadcast({
        "type": "cashout_rejected",
        "user_id": result['user_id'],
        "amount": result['amount'],
        "new_credits": result['new_credits']
    })
    
    return {"success": True, "result": result}


@app.post("/automation/start")
async def start_automation(headless: bool = False):
    """Start the browser automation"""
    try:
        if state.automation and state.is_browser_running:
            return {"message": "Browser already running", "success": True}
        
        state.automation = PisoperyaAutomation()
        await state.automation.start_browser(headless=headless)
        state.is_browser_running = True
        
        await broadcast_state()
        return {"message": "Browser started successfully", "success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/automation/login")
async def perform_login():
    """Login to Pisoperya (legacy)"""
    try:
        if not state.automation or not state.is_browser_running:
            state.automation = PisoperyaAutomation()
            await state.automation.start_browser(headless=False)
            state.is_browser_running = True
        
        success = await state.automation.login()
        state.is_logged_in = success
        
        await broadcast_state()
        
        if success:
            return {"message": "Login successful", "success": True}
        else:
            raise HTTPException(status_code=401, detail="Login failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/automation/login-wcc")
async def perform_wcc_login():
    """Login to WCC Games (Official Site)"""
    try:
        if not state.automation or not state.is_browser_running:
            state.automation = PisoperyaAutomation()
            await state.automation.start_browser(headless=False)
            state.is_browser_running = True
        
        success = await state.automation.login_wcc()
        state.is_logged_in = success
        
        await broadcast_state()
        
        if success:
            return {"message": "WCC Login successful", "success": True, "site": "wcc"}
        else:
            raise HTTPException(status_code=401, detail="WCC Login failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/automation/enter-arena")
async def enter_wcc_arena():
    """Enter the WCC cockpit arena and set up stream proxy"""
    try:
        if not state.automation:
            raise HTTPException(status_code=400, detail="Browser not started")
        
        success = await state.automation.enter_wcc_arena()
        stream_url = state.automation.hls_url
        
        # Automatically extract cookies and set up proxy
        proxy_url = None
        if success and state.automation.context:
            cookies = await state.automation.get_cookies()
            stream_proxy.set_cookies_from_browser(cookies)
            proxy_url = "http://localhost:8000/stream/live.m3u8"
            print(f"✅ Stream proxy ready at {proxy_url}")
        
        await manager.broadcast({
            "type": "arena_loaded",
            "success": success,
            "stream_url": stream_url,
            "proxy_url": proxy_url,
            "proxy_ready": stream_proxy.is_authenticated
        })
        
        if success:
            return {
                "message": "Arena entered successfully",
                "success": True,
                "stream_url": stream_url,
                "proxy_url": proxy_url,
                "proxy_ready": stream_proxy.is_authenticated
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to enter arena")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/automation/goto-arena")
async def goto_arena():
    """Navigate to the live stream arena"""
    try:
        if not state.automation:
            raise HTTPException(status_code=400, detail="Browser not started")
        
        success = await state.automation.navigate_to_arena()
        
        # Try to find stream URL after loading
        stream_url = None
        if success:
            await asyncio.sleep(3)  # Wait for stream to load
            stream_url = await state.automation.find_stream_url_from_page()
            if not stream_url:
                stream_url = await state.automation.get_stream_url()
        
        await manager.broadcast({
            "type": "arena_loaded",
            "success": success,
            "stream_url": stream_url
        })
        
        if success:
            return {"message": "Arena loaded", "success": True, "stream_url": stream_url}
        else:
            raise HTTPException(status_code=500, detail="Failed to load arena")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/automation/stream-url")
async def get_stream_url():
    """Get the captured stream URL"""
    try:
        if not state.automation:
            return {"stream_url": None, "captured_urls": []}
        
        # Try to find stream URL from page
        stream_url = await state.automation.find_stream_url_from_page()
        if not stream_url:
            stream_url = await state.automation.get_stream_url()
        
        captured_urls = await state.automation.get_all_captured_urls()
        
        return {
            "stream_url": stream_url,
            "captured_urls": captured_urls,
            "message": "Stream URL captured" if stream_url else "No stream URL found yet"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/automation/refresh-stream")
async def refresh_stream():
    """Refresh the page to get a new stream URL"""
    try:
        if not state.automation or not state.automation.page:
            raise HTTPException(status_code=400, detail="Browser not started")
        
        # Clear captured URLs
        state.automation.captured_urls = []
        state.automation.hls_url = None
        
        # Refresh the page
        await state.automation.page.reload(wait_until="networkidle")
        await asyncio.sleep(3)
        
        # Try to find new stream URL
        stream_url = await state.automation.find_stream_url_from_page()
        
        await manager.broadcast({
            "type": "stream_refreshed",
            "stream_url": stream_url
        })
        
        return {"message": "Stream refreshed", "stream_url": stream_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/automation/extract-cookies")
async def extract_cookies():
    """Extract cookies from the browser session for stream proxy"""
    try:
        if not state.automation or not state.automation.context:
            raise HTTPException(status_code=400, detail="Browser not started or not logged in")
        
        # Get cookies from browser context
        cookies = await state.automation.context.cookies()
        
        # Set cookies in the stream proxy
        stream_proxy.set_cookies_from_browser(cookies)
        
        await manager.broadcast({
            "type": "cookies_extracted",
            "count": len(cookies),
            "proxy_ready": True
        })
        
        return {
            "message": f"Extracted {len(cookies)} cookies",
            "proxy_ready": True,
            "proxy_url": "/stream/live.m3u8"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ STREAM PROXY ENDPOINTS ============

@app.get("/stream/live.m3u8")
async def get_stream_manifest(request: Request):
    """Proxy the HLS manifest file"""
    if not stream_proxy.is_authenticated:
        raise HTTPException(
            status_code=401, 
            detail="Not authenticated. Login and extract cookies first."
        )
    
    # Set the proxy base URL based on the request host
    host = request.headers.get('host', 'localhost:8000')
    scheme = 'https' if 'railway.app' in host or request.headers.get('x-forwarded-proto') == 'https' else 'http'
    stream_proxy.proxy_base_url = f"{scheme}://{host}/stream"
    
    content = await stream_proxy.fetch_manifest()
    
    if content is None:
        raise HTTPException(status_code=502, detail="Failed to fetch stream manifest")
    
    return Response(
        content=content,
        media_type="application/vnd.apple.mpegurl",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache"
        }
    )


@app.get("/stream/proxy")
async def proxy_stream_url(url: str):
    """Proxy any stream-related URL (segments, sub-playlists)"""
    if not stream_proxy.is_authenticated:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Login and extract cookies first."
        )
    
    content, content_type = await stream_proxy.proxy_request(url)
    
    if content is None:
        raise HTTPException(status_code=502, detail="Failed to fetch stream content")
    
    return Response(
        content=content,
        media_type=content_type,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache"
        }
    )


@app.get("/stream/segment")
async def proxy_segment_by_url(url: str):
    """Proxy video segments and sub-playlists by URL query parameter - OPTIMIZED"""
    if not stream_proxy.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if this is another m3u8 (sub-playlist) or a segment
    if url.endswith('.m3u8'):
        content = await stream_proxy.fetch_manifest(url)
        if content is None:
            raise HTTPException(status_code=502, detail="Failed to fetch sub-playlist")
        return Response(
            content=content,
            media_type="application/vnd.apple.mpegurl",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache"
            }
        )
    else:
        # Video segment (.ts file) - no logging for speed
        content = await stream_proxy.fetch_segment(url)
        
        if content is None:
            raise HTTPException(status_code=502, detail="Failed to fetch segment")
        
        return Response(
            content=content,
            media_type="video/MP2T",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=86400",  # Cache 24h - segments are immutable
                "X-Content-Type-Options": "nosniff"
            }
        )


@app.get("/stream/segment/{path:path}")
async def proxy_segment_by_path(path: str):
    """Proxy video segments by path"""
    if not stream_proxy.is_authenticated:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated"
        )
    
    # Construct full URL from the base
    full_url = f"{stream_proxy.base_url}{path}"
    content = await stream_proxy.fetch_segment(full_url)
    
    if content is None:
        raise HTTPException(status_code=502, detail="Failed to fetch segment")
    
    return Response(
        content=content,
        media_type="video/MP2T",
        headers={
            "Access-Control-Allow-Origin": "*"
        }
    )


@app.get("/stream/status")
async def stream_status():
    """Check if stream is ready - supports both direct and proxy modes"""
    
    # Direct mode: Users connect directly to stream (scalable)
    if STREAM_MODE == 'direct' and DIRECT_STREAM_URL:
        return {
            "mode": "direct",
            "authenticated": True,  # Direct mode doesn't need auth through us
            "stream_url": DIRECT_STREAM_URL,
            "scalable": True,
            "max_users": "unlimited"
        }
    
    # Proxy mode: Stream goes through our server (limited scale)
    return {
        "mode": "proxy",
        "authenticated": stream_proxy.is_authenticated,
        "cookies_count": len(stream_proxy.cookies),
        "stream_url": "/stream/live.m3u8" if stream_proxy.is_authenticated else None,
        "direct_url": WCC_STREAM_URL,
        "scalable": False,
        "max_users": "~50-100 (bandwidth limited)",
        "warning": "Proxy mode not recommended for production. Set STREAM_MODE=direct and DIRECT_STREAM_URL for scale."
    }


@app.get("/stream/export-cookies")
async def export_cookies():
    """Export current cookies as JSON (for copying to another server)"""
    if not stream_proxy.cookies:
        raise HTTPException(status_code=404, detail="No cookies available. Login first.")
    
    import json
    return {
        "cookies": stream_proxy.cookies,
        "cookies_json": json.dumps(stream_proxy.cookies),
        "count": len(stream_proxy.cookies),
        "instruction": "Copy cookies_json and paste into /stream/set-cookies on your production server"
    }


@app.post("/stream/set-cookies")
async def set_manual_cookies(data: ManualCookies):
    """Manually set cookies for stream proxy
    
    Accepts formats:
    - JSON object: {"cookie1": "value1", "cookie2": "value2"}
    - JSON array: [{"name": "session", "value": "abc123"}, ...]
    - Cookie header: "session=abc123; token=xyz456; ..."
    """
    import json
    
    try:
        cookies_str = data.cookies.strip()
        
        # Try to parse as JSON
        if cookies_str.startswith('{'):
            # JSON object/dict format
            cookies_dict = json.loads(cookies_str)
            stream_proxy.set_cookies_from_string(cookies_dict)
            count = len(cookies_dict)
        elif cookies_str.startswith('['):
            # JSON array format (from browser)
            cookies_list = json.loads(cookies_str)
            stream_proxy.set_cookies_from_browser(cookies_list)
            count = len(cookies_list)
        else:
            # Cookie header string format (name=value; name2=value2)
            cookies_dict = {}
            for part in cookies_str.split(';'):
                part = part.strip()
                if '=' in part:
                    name, value = part.split('=', 1)
                    cookies_dict[name.strip()] = value.strip()
            
            stream_proxy.set_cookies_from_string(cookies_dict)
            count = len(cookies_dict)
        
        # Broadcast to clients
        await manager.broadcast({
            "type": "cookies_set_manually",
            "count": count,
            "proxy_ready": stream_proxy.is_authenticated
        })
        
        return {
            "success": True,
            "message": f"Set {count} cookies successfully",
            "proxy_ready": stream_proxy.is_authenticated,
            "proxy_url": "/stream/live.m3u8"
        }
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse cookies: {str(e)}")


@app.post("/automation/stop")
async def stop_automation():
    """Stop the browser automation"""
    try:
        if state.automation:
            await state.automation.close()
            state.automation = None
        
        state.is_browser_running = False
        state.is_logged_in = False
        
        await broadcast_state()
        return {"message": "Browser stopped", "success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/betting/open")
async def open_betting():
    """Open betting for current fight"""
    state.betting_status = "open"
    await manager.broadcast({
        "type": "betting_status",
        "status": "open",
        "message": "Betting is now open!"
    })
    await broadcast_state()
    return {"status": "open"}


@app.post("/betting/last-call")
async def last_call():
    """Trigger last call countdown"""
    state.betting_status = "lastcall"
    await manager.broadcast({
        "type": "betting_status",
        "status": "lastcall",
        "countdown": state.last_call_time,
        "message": f"Last call! {state.last_call_time} seconds!"
    })
    await broadcast_state()
    return {"status": "lastcall", "countdown": state.last_call_time}


@app.post("/betting/close")
async def close_betting():
    """Close betting"""
    state.betting_status = "closed"
    await manager.broadcast({
        "type": "betting_status",
        "status": "closed",
        "message": "Betting is now closed!"
    })
    await broadcast_state()
    return {"status": "closed"}


@app.post("/betting/add")
async def add_bet(bet: BetRequest):
    """Add a new bet - with server-side credit validation"""
    if state.betting_status in ["closed", "result"]:
        raise HTTPException(status_code=400, detail="Betting is closed")
    
    if bet.amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid bet amount")
    
    if bet.amount > 100000:  # Max bet limit
        raise HTTPException(status_code=400, detail="Bet amount exceeds maximum limit")
    
    user_credits = None
    new_credits = None
    
    # If user_id provided, validate credits from DATABASE (not client)
    if bet.user_id:
        # Get ACTUAL credits from database
        user = await db.get_user_by_id(bet.user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_credits = user.get('credits', 0)
        
        # Server-side validation - NEVER trust client
        if bet.amount > user_credits:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient credits. You have ₱{user_credits}, tried to bet ₱{bet.amount}"
            )
        
        # Deduct credits in DATABASE atomically
        new_credits = await db.update_credits(bet.user_id, -bet.amount)
        if new_credits is None:
            raise HTTPException(status_code=500, detail="Failed to process bet")
    
    new_bet = {
        "id": int(datetime.now().timestamp() * 1000),
        "name": bet.name,
        "amount": bet.amount,
        "side": bet.side,
        "user_id": bet.user_id,  # Store for payout
        "timestamp": datetime.now().isoformat()
    }
    state.bets.append(new_bet)
    
    await manager.broadcast({
        "type": "new_bet",
        "bet": new_bet
    })
    await broadcast_state()
    
    response = {"message": "Bet added", "bet": new_bet}
    if new_credits is not None:
        response["new_credits"] = new_credits  # Return verified credits from DB
    
    return response


@app.delete("/betting/{bet_id}")
async def remove_bet(bet_id: int):
    """Remove a bet"""
    state.bets = [b for b in state.bets if b["id"] != bet_id]
    await broadcast_state()
    return {"message": "Bet removed"}


@app.post("/fight/declare-winner")
async def declare_winner(declaration: WinnerDeclaration):
    """Declare the winner of the fight and pay out winners"""
    winner = declaration.winner
    
    # Process payouts for winning bets (2x return) and save to history
    payouts = []
    if winner in ['meron', 'wala']:
        for bet in state.bets:
            is_winner = bet.get('side') == winner
            payout_amount = bet['amount'] * 2 if is_winner else 0
            result = 'win' if is_winner else 'lose'
            
            if bet.get('user_id'):
                if is_winner:
                    # Pay winner 2x their bet
                    new_credits = await db.update_credits(bet['user_id'], payout_amount)
                    if new_credits is not None:
                        payouts.append({
                            'user_id': bet['user_id'],
                            'name': bet['name'],
                            'bet_amount': bet['amount'],
                            'payout': payout_amount,
                            'new_credits': new_credits
                        })
                
                # Save bet to history (both wins and losses)
                await db.save_bet_to_history(
                    user_id=bet['user_id'],
                    username=bet['name'],
                    fight_number=state.current_fight,
                    amount=bet['amount'],
                    side=bet['side'],
                    result=result,
                    payout=payout_amount
                )
                
    elif winner == 'draw':
        # Refund all bets on draw
        for bet in state.bets:
            if bet.get('user_id'):
                new_credits = await db.update_credits(bet['user_id'], bet['amount'])
                if new_credits is not None:
                    payouts.append({
                        'user_id': bet['user_id'],
                        'name': bet['name'],
                        'refund': bet['amount'],
                        'new_credits': new_credits
                    })
                
                # Save to history as draw
                await db.save_bet_to_history(
                    user_id=bet['user_id'],
                    username=bet['name'],
                    fight_number=state.current_fight,
                    amount=bet['amount'],
                    side=bet['side'],
                    result='draw',
                    payout=bet['amount']  # Refund amount
                )
                
    elif winner == 'cancelled':
        # Refund all bets on cancellation
        for bet in state.bets:
            if bet.get('user_id'):
                new_credits = await db.update_credits(bet['user_id'], bet['amount'])
                if new_credits is not None:
                    payouts.append({
                        'user_id': bet['user_id'],
                        'name': bet['name'],
                        'refund': bet['amount'],
                        'new_credits': new_credits
                    })
                
                # Save to history as cancelled
                await db.save_bet_to_history(
                    user_id=bet['user_id'],
                    username=bet['name'],
                    fight_number=state.current_fight,
                    amount=bet['amount'],
                    side=bet['side'],
                    result='cancelled',
                    payout=bet['amount']  # Refund amount
                )
    
    # Add to in-memory history
    history_entry = {
        "fight": state.current_fight,
        "result": winner,
        "bets": state.bets.copy(),
        "payouts": payouts,
        "timestamp": datetime.now().isoformat()
    }
    state.history.insert(0, history_entry)
    
    # Broadcast winner with payouts info
    await manager.broadcast({
        "type": "winner_declared",
        "winner": winner,
        "fight": state.current_fight,
        "delay": state.stream_delay,
        "payouts": payouts  # Send payout info so clients can update
    })
    
    state.betting_status = "result"
    await broadcast_state()
    
    return {"message": f"{winner} wins!", "fight": state.current_fight, "payouts": payouts}


@app.post("/fight/reset")
async def reset_fight():
    """Reset for next fight"""
    state.current_fight += 1
    state.betting_status = "waiting"
    state.bets = []
    
    await manager.broadcast({
        "type": "fight_reset",
        "fight": state.current_fight
    })
    await broadcast_state()
    
    return {"message": "Ready for next fight", "fight": state.current_fight}


@app.put("/settings")
async def update_settings(settings: SettingsUpdate):
    """Update settings"""
    if settings.stream_delay is not None:
        state.stream_delay = settings.stream_delay
    if settings.last_call_time is not None:
        state.last_call_time = settings.last_call_time
    
    await broadcast_state()
    return {"message": "Settings updated"}


@app.get("/bets")
async def get_bets():
    """Get all current bets"""
    return {
        "bets": state.bets,
        "meron_total": sum(b["amount"] for b in state.bets if b["side"] == "meron"),
        "wala_total": sum(b["amount"] for b in state.bets if b["side"] == "wala"),
        "meron_count": len([b for b in state.bets if b["side"] == "meron"]),
        "wala_count": len([b for b in state.bets if b["side"] == "wala"])
    }


@app.get("/history")
async def get_history():
    """Get fight history"""
    return {"history": state.history[:50]}  # Last 50 fights


# WebSocket Endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    connected = await manager.connect(websocket)
    if not connected:
        return  # Connection was rejected due to limit
    
    # Send current state on connect
    await websocket.send_json({
        "type": "connected",
        "data": {
            "fight_number": state.current_fight,
            "status": state.betting_status,
            "bets": state.bets,
            "history": state.history[:20],
            "stream_delay": state.stream_delay,
            "last_call_time": state.last_call_time,
            "is_browser_running": state.is_browser_running,
            "is_logged_in": state.is_logged_in
        }
    })
    
    try:
        while True:
            # Receive messages from client
            data = await websocket.receive_json()
            
            # Handle different message types
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            
            elif data.get("type") == "add_bet":
                if state.betting_status not in ["closed", "result"]:
                    new_bet = {
                        "id": int(datetime.now().timestamp() * 1000),
                        "name": data["name"],
                        "amount": data["amount"],
                        "side": data["side"],
                        "timestamp": datetime.now().isoformat()
                    }
                    state.bets.append(new_bet)
                    await broadcast_state()
            
            elif data.get("type") == "remove_bet":
                state.bets = [b for b in state.bets if b["id"] != data["id"]]
                await broadcast_state()
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
