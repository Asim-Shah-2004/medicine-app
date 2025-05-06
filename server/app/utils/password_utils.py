import bcrypt
from app.config import Config

def hash_password(password):
    """
    Hash a password using bcrypt
    """
    if isinstance(password, str):
        password = password.encode('utf-8')
    
    salt = bcrypt.gensalt(log_rounds=Config.BCRYPT_LOG_ROUNDS)  
    hashed = bcrypt.hashpw(password, salt)
    return hashed

def check_password(password, hashed_password):
    """
    Verify a password against its hash
    """
    if isinstance(password, str):
        password = password
    
    if isinstance(hashed_password, str):
        hashed_password = hashed_password
        
    
    return bcrypt.hashpw(password, hashed_password) == hashed_password

def validate_password(password):
    """
    Validate password strength
    Returns (is_valid, message)
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
        
    if not any(c.isupper() for c in password) or not any(c.islower() for c in password):
        return False, "Password must contain both uppercase and lowercase letters"
        
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number"
        
    if not any(c in "!@#$%^&*()_-+={}[]|:;<>,.?/~`" for c in password):
        return False, "Password must contain at least one special character"
        
    return True, "Password is valid"