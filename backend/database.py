"""
Database module for user authentication
PostgreSQL with asyncpg

For LOCAL DEVELOPMENT: If DATABASE_URL is not set, uses in-memory storage.
For PRODUCTION: Requires PostgreSQL DATABASE_URL.
"""

import os
import asyncpg
import bcrypt
from typing import Optional, Dict
from datetime import datetime

# Database connection URL - MUST be set as environment variable in production!
DATABASE_URL = os.environ.get('DATABASE_URL', '')

# Global connection pool
pool: Optional[asyncpg.Pool] = None

# In-memory storage for local development (no database)
LOCAL_MODE = False
_local_users: Dict[int, Dict] = {}
_local_user_counter = 0
_local_settings: Dict[str, str] = {'gcash_number': '09XXXXXXXXX', 'gcash_name': 'Your Name'}
_local_cashin_requests: list = []
_local_cashout_requests: list = []
_local_bet_history: list = []


async def init_db():
    """Initialize database connection and create tables"""
    global pool, LOCAL_MODE, _local_users, _local_user_counter
    
    if not DATABASE_URL:
        print("⚠️ DATABASE_URL not set - running in LOCAL MODE (in-memory storage)")
        print("   Data will be lost when server restarts!")
        LOCAL_MODE = True
        
        # Create default admin user for local testing
        admin_hash = hash_password("admin123")
        _local_users[1] = {
            'id': 1,
            'username': 'admin',
            'password_hash': admin_hash,
            'credits': 999999,
            'is_admin': True,
            'role': 'admin',
            'created_at': datetime.now()
        }
        _local_user_counter = 1
        print("✅ Local mode ready! Default admin: admin / admin123")
        return
    
    try:
        pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=60
        )
        print("✅ Database connected!")
        
        # Create users table if not exists
        async with pool.acquire() as conn:
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    credits INTEGER DEFAULT 1000,
                    is_admin BOOLEAN DEFAULT FALSE,
                    role VARCHAR(20) DEFAULT 'user',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP
                )
            ''')
            
            # Add role column if it doesn't exist (for existing databases)
            await conn.execute('''
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                   WHERE table_name='users' AND column_name='role') THEN
                        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';
                    END IF;
                END $$;
            ''')
            print("✅ Users table ready!")
            
            # Create default admin if not exists
            admin_exists = await conn.fetchval(
                "SELECT COUNT(*) FROM users WHERE username = 'admin'"
            )
            if not admin_exists:
                admin_hash = hash_password("admin123")
                await conn.execute(
                    "INSERT INTO users (username, password_hash, credits, is_admin, role) VALUES ($1, $2, $3, $4, $5)",
                    "admin", admin_hash, 999999, True, "admin"
                )
                print("✅ Default admin created (username: admin, password: admin123)")
            else:
                # Update existing admin to have role
                await conn.execute(
                    "UPDATE users SET role = 'admin' WHERE username = 'admin' AND (role IS NULL OR role = 'user')"
                )
            
            # Create default cashier if not exists
            cashier_exists = await conn.fetchval(
                "SELECT COUNT(*) FROM users WHERE username = 'cashier'"
            )
            if not cashier_exists:
                cashier_hash = hash_password("cashier123")
                await conn.execute(
                    "INSERT INTO users (username, password_hash, credits, is_admin, role) VALUES ($1, $2, $3, $4, $5)",
                    "cashier", cashier_hash, 999999, False, "cashier"
                )
                print("✅ Default cashier created (username: cashier, password: cashier123)")
        
        # Create additional tables
        await init_settings_table()
        await init_cashin_table()
        await init_cashout_table()
        await init_bet_history_table()
        await init_support_tables()
                
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        raise


async def close_db():
    """Close database connection"""
    global pool
    if LOCAL_MODE:
        print("👋 Local mode - nothing to close")
        return
    if pool:
        await pool.close()
        print("👋 Database connection closed")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash"""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


async def create_user(username: str, password: str) -> Optional[Dict]:
    """Create a new user"""
    global pool, _local_users, _local_user_counter
    
    if LOCAL_MODE:
        # Check if username exists
        for u in _local_users.values():
            if u['username'] == username:
                return None
        _local_user_counter += 1
        user = {
            'id': _local_user_counter,
            'username': username,
            'password_hash': hash_password(password),
            'credits': 1000,
            'is_admin': False,
            'role': 'user',
            'created_at': datetime.now()
        }
        _local_users[_local_user_counter] = user
        return {k: v for k, v in user.items() if k != 'password_hash'}
    
    try:
        password_hash = hash_password(password)
        async with pool.acquire() as conn:
            user = await conn.fetchrow(
                '''
                INSERT INTO users (username, password_hash, role) 
                VALUES ($1, $2, 'user') 
                RETURNING id, username, credits, is_admin, role, created_at
                ''',
                username, password_hash
            )
            return dict(user) if user else None
    except asyncpg.UniqueViolationError:
        return None  # Username already exists
    except Exception as e:
        print(f"Error creating user: {e}")
        return None


async def authenticate_user(username: str, password: str) -> Optional[Dict]:
    """Authenticate a user and return their data"""
    global pool
    
    if LOCAL_MODE:
        for user in _local_users.values():
            if user['username'] == username and verify_password(password, user['password_hash']):
                return {
                    "id": user['id'],
                    "username": user['username'],
                    "credits": user['credits'],
                    "is_admin": user['is_admin'],
                    "role": user.get('role', 'user')
                }
        return None
    
    try:
        async with pool.acquire() as conn:
            user = await conn.fetchrow(
                "SELECT id, username, password_hash, credits, is_admin, role FROM users WHERE username = $1",
                username
            )
            
            if user and verify_password(password, user['password_hash']):
                # Update last login
                await conn.execute(
                    "UPDATE users SET last_login = $1 WHERE id = $2",
                    datetime.now(), user['id']
                )
                return {
                    "id": user['id'],
                    "username": user['username'],
                    "credits": user['credits'],
                    "is_admin": user['is_admin'],
                    "role": user['role'] or 'user'
                }
            return None
    except Exception as e:
        print(f"Error authenticating user: {e}")
        return None


async def get_user_by_id(user_id: int) -> Optional[Dict]:
    """Get user by ID"""
    global pool
    
    if LOCAL_MODE:
        user = _local_users.get(user_id)
        if user:
            return {
                'id': user['id'],
                'username': user['username'],
                'credits': user['credits'],
                'is_admin': user['is_admin'],
                'role': user.get('role', 'user')
            }
        return None
    
    try:
        async with pool.acquire() as conn:
            user = await conn.fetchrow(
                "SELECT id, username, credits, is_admin, role FROM users WHERE id = $1",
                user_id
            )
            if user:
                result = dict(user)
                result['role'] = result.get('role') or 'user'
                return result
            return None
    except Exception as e:
        print(f"Error getting user: {e}")
        return None


async def update_credits(user_id: int, amount: int) -> Optional[int]:
    """Update user credits (add or subtract)"""
    global pool
    
    if LOCAL_MODE:
        user = _local_users.get(user_id)
        if user:
            user['credits'] = user['credits'] + amount
            return user['credits']
        return None
    
    try:
        async with pool.acquire() as conn:
            new_credits = await conn.fetchval(
                '''
                UPDATE users 
                SET credits = credits + $1 
                WHERE id = $2 
                RETURNING credits
                ''',
                amount, user_id
            )
            return new_credits
    except Exception as e:
        print(f"Error updating credits: {e}")
        return None


async def set_credits(user_id: int, credits: int) -> Optional[int]:
    """Set user credits to specific amount"""
    global pool
    
    if LOCAL_MODE:
        user = _local_users.get(user_id)
        if user:
            user['credits'] = credits
            return credits
        return None
    
    try:
        async with pool.acquire() as conn:
            new_credits = await conn.fetchval(
                '''
                UPDATE users 
                SET credits = $1 
                WHERE id = $2 
                RETURNING credits
                ''',
                credits, user_id
            )
            return new_credits
    except Exception as e:
        print(f"Error setting credits: {e}")
        return None


async def get_all_users() -> list:
    """Get all users (admin only)"""
    global pool
    
    if LOCAL_MODE:
        return [{
            'id': u['id'],
            'username': u['username'],
            'credits': u['credits'],
            'is_admin': u['is_admin'],
            'created_at': u.get('created_at'),
            'last_login': u.get('last_login')
        } for u in _local_users.values()]
    
    try:
        async with pool.acquire() as conn:
            users = await conn.fetch(
                "SELECT id, username, credits, is_admin, created_at, last_login FROM users ORDER BY id"
            )
            return [dict(u) for u in users]
    except Exception as e:
        print(f"Error getting users: {e}")
        return []


# ============ SETTINGS TABLE ============
async def init_settings_table():
    """Create settings table if not exists"""
    global pool
    
    if LOCAL_MODE:
        return  # Use in-memory _local_settings
    
    try:
        async with pool.acquire() as conn:
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS settings (
                    key VARCHAR(50) PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Insert default GCash settings if not exists
            await conn.execute('''
                INSERT INTO settings (key, value) VALUES ('gcash_number', '09XXXXXXXXX')
                ON CONFLICT (key) DO NOTHING
            ''')
            await conn.execute('''
                INSERT INTO settings (key, value) VALUES ('gcash_name', 'Your Name')
                ON CONFLICT (key) DO NOTHING
            ''')
            print("✅ Settings table ready!")
    except Exception as e:
        print(f"Error creating settings table: {e}")


async def get_setting(key: str) -> Optional[str]:
    """Get a setting value by key"""
    global pool
    
    try:
        async with pool.acquire() as conn:
            value = await conn.fetchval(
                "SELECT value FROM settings WHERE key = $1",
                key
            )
            return value
    except Exception as e:
        print(f"Error getting setting: {e}")
        return None


async def set_setting(key: str, value: str) -> bool:
    """Set a setting value"""
    global pool
    
    try:
        async with pool.acquire() as conn:
            await conn.execute('''
                INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
            ''', key, value)
            return True
    except Exception as e:
        print(f"Error setting value: {e}")
        return False


async def get_gcash_settings() -> dict:
    """Get GCash settings"""
    if LOCAL_MODE:
        return _local_settings.copy()
    
    number = await get_setting('gcash_number') or '09XXXXXXXXX'
    name = await get_setting('gcash_name') or 'Your Name'
    return {
        'gcash_number': number,
        'gcash_name': name
    }


async def update_gcash_settings(number: str, name: str) -> bool:
    """Update GCash settings"""
    if LOCAL_MODE:
        _local_settings['gcash_number'] = number
        _local_settings['gcash_name'] = name
        return True
    
    result1 = await set_setting('gcash_number', number)
    result2 = await set_setting('gcash_name', name)
    return result1 and result2


# ============ CASH IN REQUESTS ============
async def init_cashin_table():
    """Create cash in requests table"""
    global pool
    
    if LOCAL_MODE:
        return  # Use in-memory _local_cashin_requests
    
    try:
        async with pool.acquire() as conn:
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS cashin_requests (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id),
                    amount INTEGER NOT NULL,
                    reference_code VARCHAR(20) UNIQUE NOT NULL,
                    status VARCHAR(20) DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    approved_at TIMESTAMP,
                    approved_by INTEGER
                )
            ''')
            print("✅ Cash-in requests table ready!")
    except Exception as e:
        print(f"Error creating cashin table: {e}")


async def create_cashin_request(user_id: int, amount: int) -> Optional[dict]:
    """Create a new cash-in request"""
    global pool
    import random
    import string
    
    # Generate unique reference code
    reference_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow('''
                INSERT INTO cashin_requests (user_id, amount, reference_code)
                VALUES ($1, $2, $3)
                RETURNING id, user_id, amount, reference_code, status, created_at
            ''', user_id, amount, reference_code)
            return dict(row) if row else None
    except Exception as e:
        print(f"Error creating cashin request: {e}")
        return None


async def get_pending_cashin_requests() -> list:
    """Get all pending cash-in requests (admin)"""
    global pool
    
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT c.*, u.username 
                FROM cashin_requests c
                JOIN users u ON c.user_id = u.id
                WHERE c.status = 'pending'
                ORDER BY c.created_at DESC
            ''')
            return [dict(r) for r in rows]
    except Exception as e:
        print(f"Error getting cashin requests: {e}")
        return []


async def get_user_cashin_requests(user_id: int) -> list:
    """Get cash-in requests for a user"""
    global pool
    
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT * FROM cashin_requests
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT 20
            ''', user_id)
            return [dict(r) for r in rows]
    except Exception as e:
        print(f"Error getting user cashin requests: {e}")
        return []


async def approve_cashin_request(request_id: int, admin_id: int) -> Optional[dict]:
    """Approve a cash-in request and credit the user"""
    global pool
    
    try:
        async with pool.acquire() as conn:
            # Get the request
            request = await conn.fetchrow(
                "SELECT * FROM cashin_requests WHERE id = $1 AND status = 'pending'",
                request_id
            )
            
            if not request:
                return None
            
            # Update request status
            await conn.execute('''
                UPDATE cashin_requests 
                SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = $1
                WHERE id = $2
            ''', admin_id, request_id)
            
            # Credit the user
            await conn.execute(
                "UPDATE users SET credits = credits + $1 WHERE id = $2",
                request['amount'], request['user_id']
            )
            
            # Get updated user credits
            new_credits = await conn.fetchval(
                "SELECT credits FROM users WHERE id = $1",
                request['user_id']
            )
            
            return {
                'request_id': request_id,
                'user_id': request['user_id'],
                'amount': request['amount'],
                'new_credits': new_credits
            }
    except Exception as e:
        print(f"Error approving cashin: {e}")
        return None


async def reject_cashin_request(request_id: int, admin_id: int) -> bool:
    """Reject a cash-in request"""
    global pool
    
    try:
        async with pool.acquire() as conn:
            await conn.execute('''
                UPDATE cashin_requests 
                SET status = 'rejected', approved_at = CURRENT_TIMESTAMP, approved_by = $1
                WHERE id = $2 AND status = 'pending'
            ''', admin_id, request_id)
            return True
    except Exception as e:
        print(f"Error rejecting cashin: {e}")
        return False


# ============ CASH OUT REQUESTS ============
async def init_cashout_table():
    """Create cash out requests table"""
    global pool
    
    if LOCAL_MODE:
        return  # Use in-memory _local_cashout_requests
    
    try:
        async with pool.acquire() as conn:
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS cashout_requests (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id),
                    amount INTEGER NOT NULL,
                    gcash_number VARCHAR(20) NOT NULL,
                    gcash_name VARCHAR(100) NOT NULL,
                    reference_code VARCHAR(20) UNIQUE NOT NULL,
                    status VARCHAR(20) DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    processed_at TIMESTAMP,
                    processed_by INTEGER
                )
            ''')
            print("✅ Cash-out requests table ready!")
    except Exception as e:
        print(f"Error creating cashout table: {e}")


async def create_cashout_request(user_id: int, amount: int, gcash_number: str, gcash_name: str) -> Optional[dict]:
    """Create a new cash-out request (deducts credits immediately)"""
    global pool
    import random
    import string
    
    reference_code = 'OUT-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    
    try:
        async with pool.acquire() as conn:
            # Check if user has enough credits
            user_credits = await conn.fetchval(
                "SELECT credits FROM users WHERE id = $1",
                user_id
            )
            
            if user_credits is None or user_credits < amount:
                return None
            
            # Deduct credits first (hold)
            await conn.execute(
                "UPDATE users SET credits = credits - $1 WHERE id = $2",
                amount, user_id
            )
            
            # Create request
            row = await conn.fetchrow('''
                INSERT INTO cashout_requests (user_id, amount, gcash_number, gcash_name, reference_code)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, user_id, amount, gcash_number, gcash_name, reference_code, status, created_at
            ''', user_id, amount, gcash_number, gcash_name, reference_code)
            
            # Get new balance
            new_credits = await conn.fetchval(
                "SELECT credits FROM users WHERE id = $1",
                user_id
            )
            
            result = dict(row) if row else None
            if result:
                result['new_credits'] = new_credits
            return result
    except Exception as e:
        print(f"Error creating cashout request: {e}")
        return None


async def get_pending_cashout_requests() -> list:
    """Get all pending cash-out requests"""
    global pool
    
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT c.*, u.username 
                FROM cashout_requests c
                JOIN users u ON c.user_id = u.id
                WHERE c.status = 'pending'
                ORDER BY c.created_at DESC
            ''')
            return [dict(r) for r in rows]
    except Exception as e:
        print(f"Error getting cashout requests: {e}")
        return []


async def get_user_cashout_requests(user_id: int) -> list:
    """Get cash-out requests for a user"""
    global pool
    
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT * FROM cashout_requests
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT 20
            ''', user_id)
            return [dict(r) for r in rows]
    except Exception as e:
        print(f"Error getting user cashout requests: {e}")
        return []


async def approve_cashout_request(request_id: int, staff_id: int) -> Optional[dict]:
    """Approve a cash-out request (credits already deducted)"""
    global pool
    
    try:
        async with pool.acquire() as conn:
            request = await conn.fetchrow(
                "SELECT * FROM cashout_requests WHERE id = $1 AND status = 'pending'",
                request_id
            )
            
            if not request:
                return None
            
            # Update request status
            await conn.execute('''
                UPDATE cashout_requests 
                SET status = 'approved', processed_at = CURRENT_TIMESTAMP, processed_by = $1
                WHERE id = $2
            ''', staff_id, request_id)
            
            return {
                'request_id': request_id,
                'user_id': request['user_id'],
                'amount': request['amount'],
                'gcash_number': request['gcash_number'],
                'gcash_name': request['gcash_name']
            }
    except Exception as e:
        print(f"Error approving cashout: {e}")
        return None


# ============ BET HISTORY TABLE ============
async def init_bet_history_table():
    """Create bet history table to track all bets"""
    global pool
    
    if LOCAL_MODE:
        return  # Use in-memory _local_bet_history
    
    try:
        async with pool.acquire() as conn:
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS bet_history (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id),
                    username VARCHAR(50) NOT NULL,
                    fight_number INTEGER NOT NULL,
                    amount INTEGER NOT NULL,
                    side VARCHAR(10) NOT NULL,
                    result VARCHAR(20),
                    payout INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            print("✅ Bet history table ready!")
    except Exception as e:
        print(f"Error creating bet_history table: {e}")


async def save_bet_to_history(user_id: int, username: str, fight_number: int, 
                               amount: int, side: str, result: str, payout: int) -> bool:
    """Save a completed bet to history"""
    global pool
    
    if LOCAL_MODE:
        _local_bet_history.append({
            'id': len(_local_bet_history) + 1,
            'user_id': user_id,
            'username': username,
            'fight_number': fight_number,
            'amount': amount,
            'side': side,
            'result': result,
            'payout': payout,
            'created_at': datetime.now()
        })
        return True
    
    try:
        async with pool.acquire() as conn:
            await conn.execute('''
                INSERT INTO bet_history (user_id, username, fight_number, amount, side, result, payout)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            ''', user_id, username, fight_number, amount, side, result, payout)
            return True
    except Exception as e:
        print(f"Error saving bet to history: {e}")
        return False


async def get_user_bet_history(user_id: int, limit: int = 50) -> list:
    """Get bet history for a user"""
    global pool
    
    if LOCAL_MODE:
        user_bets = [b for b in _local_bet_history if b['user_id'] == user_id]
        return sorted(user_bets, key=lambda x: x['created_at'], reverse=True)[:limit]
    
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT * FROM bet_history
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            ''', user_id, limit)
            return [dict(r) for r in rows]
    except Exception as e:
        print(f"Error getting bet history: {e}")
        return []


async def get_user_transactions(user_id: int, limit: int = 50) -> dict:
    """Get all transactions for a user (bets, cash-in, cash-out)"""
    global pool
    
    if LOCAL_MODE:
        user_bets = [b for b in _local_bet_history if b['user_id'] == user_id]
        user_cashins = [c for c in _local_cashin_requests if c.get('user_id') == user_id]
        user_cashouts = [c for c in _local_cashout_requests if c.get('user_id') == user_id]
        return {
            'bets': sorted(user_bets, key=lambda x: x['created_at'], reverse=True)[:limit],
            'cashins': sorted(user_cashins, key=lambda x: x.get('created_at', datetime.now()), reverse=True)[:limit],
            'cashouts': sorted(user_cashouts, key=lambda x: x.get('created_at', datetime.now()), reverse=True)[:limit]
        }
    
    try:
        async with pool.acquire() as conn:
            # Get bet history
            bets = await conn.fetch('''
                SELECT id, fight_number, amount, side, result, payout, created_at,
                       'bet' as type
                FROM bet_history
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            ''', user_id, limit)
            
            # Get cash-in history
            cashins = await conn.fetch('''
                SELECT id, amount, reference_code, status, created_at, approved_at,
                       'cashin' as type
                FROM cashin_requests
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            ''', user_id, limit)
            
            # Get cash-out history
            cashouts = await conn.fetch('''
                SELECT id, amount, gcash_number, reference_code, status, created_at, processed_at,
                       'cashout' as type
                FROM cashout_requests
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            ''', user_id, limit)
            
            return {
                'bets': [dict(r) for r in bets],
                'cashins': [dict(r) for r in cashins],
                'cashouts': [dict(r) for r in cashouts]
            }
    except Exception as e:
        print(f"Error getting transactions: {e}")
        return {'bets': [], 'cashins': [], 'cashouts': []}


async def reject_cashout_request(request_id: int, staff_id: int) -> Optional[dict]:
    """Reject a cash-out request (refund credits)"""
    global pool
    
    try:
        async with pool.acquire() as conn:
            request = await conn.fetchrow(
                "SELECT * FROM cashout_requests WHERE id = $1 AND status = 'pending'",
                request_id
            )
            
            if not request:
                return None
            
            # Refund credits
            await conn.execute(
                "UPDATE users SET credits = credits + $1 WHERE id = $2",
                request['amount'], request['user_id']
            )
            
            # Update request status
            await conn.execute('''
                UPDATE cashout_requests 
                SET status = 'rejected', processed_at = CURRENT_TIMESTAMP, processed_by = $1
                WHERE id = $2
            ''', staff_id, request_id)
            
            # Get new balance
            new_credits = await conn.fetchval(
                "SELECT credits FROM users WHERE id = $1",
                request['user_id']
            )
            
            return {
                'request_id': request_id,
                'user_id': request['user_id'],
                'amount': request['amount'],
                'new_credits': new_credits
            }
    except Exception as e:
        print(f"Error rejecting cashout: {e}")
        return None


# ============ SUPPORT TICKETS ============
_local_support_tickets: list = []
_local_support_messages: list = []
_local_ticket_counter = 0
_local_message_counter = 0


async def init_support_tables():
    """Create support ticket tables"""
    global pool
    
    if LOCAL_MODE:
        return
    
    try:
        async with pool.acquire() as conn:
            # Support tickets table
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS support_tickets (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id),
                    status VARCHAR(20) DEFAULT 'open',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    closed_at TIMESTAMP
                )
            ''')
            
            # Support messages table
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS support_messages (
                    id SERIAL PRIMARY KEY,
                    ticket_id INTEGER REFERENCES support_tickets(id),
                    sender_id INTEGER REFERENCES users(id),
                    sender_type VARCHAR(20) NOT NULL,
                    message TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            print("✅ Support ticket tables ready!")
    except Exception as e:
        print(f"Error creating support tables: {e}")


async def get_or_create_ticket(user_id: int) -> Optional[dict]:
    """Get user's open ticket or create a new one"""
    global pool, _local_support_tickets, _local_ticket_counter
    
    if LOCAL_MODE:
        # Find existing open ticket
        for ticket in _local_support_tickets:
            if ticket['user_id'] == user_id and ticket['status'] == 'open':
                return ticket
        # Create new ticket
        _local_ticket_counter += 1
        ticket = {
            'id': _local_ticket_counter,
            'user_id': user_id,
            'status': 'open',
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }
        _local_support_tickets.append(ticket)
        return ticket
    
    try:
        async with pool.acquire() as conn:
            # Check for existing open ticket
            ticket = await conn.fetchrow('''
                SELECT * FROM support_tickets 
                WHERE user_id = $1 AND status = 'open'
                ORDER BY created_at DESC LIMIT 1
            ''', user_id)
            
            if ticket:
                return dict(ticket)
            
            # Create new ticket
            ticket = await conn.fetchrow('''
                INSERT INTO support_tickets (user_id)
                VALUES ($1)
                RETURNING *
            ''', user_id)
            return dict(ticket) if ticket else None
    except Exception as e:
        print(f"Error getting/creating ticket: {e}")
        return None


async def get_ticket_messages(ticket_id: int, limit: int = 50) -> list:
    """Get messages for a ticket"""
    global pool, _local_support_messages
    
    if LOCAL_MODE:
        messages = [m for m in _local_support_messages if m['ticket_id'] == ticket_id]
        return sorted(messages, key=lambda x: x['created_at'])[-limit:]
    
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT m.*, u.username as sender_name
                FROM support_messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.ticket_id = $1
                ORDER BY m.created_at ASC
                LIMIT $2
            ''', ticket_id, limit)
            return [dict(r) for r in rows]
    except Exception as e:
        print(f"Error getting messages: {e}")
        return []


async def add_support_message(ticket_id: int, sender_id: int, sender_type: str, message: str) -> Optional[dict]:
    """Add a message to a ticket"""
    global pool, _local_support_messages, _local_message_counter, _local_support_tickets
    
    if LOCAL_MODE:
        _local_message_counter += 1
        # Get sender name
        sender_name = 'Unknown'
        if sender_id in _local_users:
            sender_name = _local_users[sender_id]['username']
        
        msg = {
            'id': _local_message_counter,
            'ticket_id': ticket_id,
            'sender_id': sender_id,
            'sender_type': sender_type,
            'sender_name': sender_name,
            'message': message,
            'created_at': datetime.now()
        }
        _local_support_messages.append(msg)
        
        # Update ticket updated_at
        for ticket in _local_support_tickets:
            if ticket['id'] == ticket_id:
                ticket['updated_at'] = datetime.now()
                break
        
        return msg
    
    try:
        async with pool.acquire() as conn:
            # Add message
            row = await conn.fetchrow('''
                INSERT INTO support_messages (ticket_id, sender_id, sender_type, message)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            ''', ticket_id, sender_id, sender_type, message)
            
            # Update ticket timestamp
            await conn.execute('''
                UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            ''', ticket_id)
            
            if row:
                result = dict(row)
                # Get sender name
                sender = await conn.fetchrow('SELECT username FROM users WHERE id = $1', sender_id)
                result['sender_name'] = sender['username'] if sender else 'Unknown'
                return result
            return None
    except Exception as e:
        print(f"Error adding message: {e}")
        return None


async def get_open_tickets() -> list:
    """Get all open support tickets (for staff)"""
    global pool, _local_support_tickets, _local_users
    
    if LOCAL_MODE:
        result = []
        for ticket in _local_support_tickets:
            if ticket['status'] == 'open':
                user = _local_users.get(ticket['user_id'], {})
                # Get last message
                messages = [m for m in _local_support_messages if m['ticket_id'] == ticket['id']]
                last_msg = messages[-1] if messages else None
                result.append({
                    **ticket,
                    'username': user.get('username', 'Unknown'),
                    'last_message': last_msg['message'][:50] if last_msg else None,
                    'message_count': len(messages)
                })
        return sorted(result, key=lambda x: x['updated_at'], reverse=True)
    
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT t.*, u.username,
                       (SELECT message FROM support_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message,
                       (SELECT COUNT(*) FROM support_messages WHERE ticket_id = t.id) as message_count
                FROM support_tickets t
                JOIN users u ON t.user_id = u.id
                WHERE t.status = 'open'
                ORDER BY t.updated_at DESC
            ''')
            return [dict(r) for r in rows]
    except Exception as e:
        print(f"Error getting open tickets: {e}")
        return []


async def close_ticket(ticket_id: int) -> bool:
    """Close a support ticket"""
    global pool, _local_support_tickets
    
    if LOCAL_MODE:
        for ticket in _local_support_tickets:
            if ticket['id'] == ticket_id:
                ticket['status'] = 'closed'
                ticket['closed_at'] = datetime.now()
                return True
        return False
    
    try:
        async with pool.acquire() as conn:
            await conn.execute('''
                UPDATE support_tickets 
                SET status = 'closed', closed_at = CURRENT_TIMESTAMP
                WHERE id = $1
            ''', ticket_id)
            return True
    except Exception as e:
        print(f"Error closing ticket: {e}")
        return False


async def get_ticket_by_id(ticket_id: int) -> Optional[dict]:
    """Get a specific ticket"""
    global pool, _local_support_tickets
    
    if LOCAL_MODE:
        for ticket in _local_support_tickets:
            if ticket['id'] == ticket_id:
                return ticket
        return None
    
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow('''
                SELECT t.*, u.username
                FROM support_tickets t
                JOIN users u ON t.user_id = u.id
                WHERE t.id = $1
            ''', ticket_id)
            return dict(row) if row else None
    except Exception as e:
        print(f"Error getting ticket: {e}")
        return None
