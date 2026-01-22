"""
Database module for user authentication
PostgreSQL with asyncpg
"""

import asyncpg
import bcrypt
from typing import Optional, Dict
from datetime import datetime

# Database connection URL
DATABASE_URL = "postgresql://postgres:ABYlnsihdIQGEKxNiREaHjOoikPwxlpM@crossover.proxy.rlwy.net:32839/railway"

# Global connection pool
pool: Optional[asyncpg.Pool] = None


async def init_db():
    """Initialize database connection and create tables"""
    global pool
    
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
                
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        raise


async def close_db():
    """Close database connection"""
    global pool
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
    global pool
    
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
    number = await get_setting('gcash_number') or '09XXXXXXXXX'
    name = await get_setting('gcash_name') or 'Your Name'
    return {
        'gcash_number': number,
        'gcash_name': name
    }


async def update_gcash_settings(number: str, name: str) -> bool:
    """Update GCash settings"""
    result1 = await set_setting('gcash_number', number)
    result2 = await set_setting('gcash_name', name)
    return result1 and result2


# ============ CASH IN REQUESTS ============
async def init_cashin_table():
    """Create cash in requests table"""
    global pool
    
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
