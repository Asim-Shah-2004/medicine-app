import bcrypt
from app.config import Config

def hash_password(password):
    """
    Hash a password for storing
    """
    # For python_bcrypt, the password must be a string, not bytes
    if isinstance(password, bytes):
        password = password.decode('utf-8')
    
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password, salt)
    return hashed

def check_password(password, hashed_password):
    """
    Verify a password against its hash
    """
    # For python_bcrypt, the password must be a string, not bytes
    if isinstance(password, bytes):
        password = password.decode('utf-8')
    
    if isinstance(hashed_password, bytes):
        hashed_password = hashed_password.decode('utf-8')
    
    # Use hashpw to compare instead of checkpw which doesn't exist in python_bcrypt
    return bcrypt.hashpw(password, hashed_password) == hashed_password
    
def verify_password(stored_password, provided_password):
    """
    Verify a stored password against a provided password
    """
    # For python_bcrypt, the password must be a string, not bytes
    if isinstance(provided_password, bytes):
        provided_password = provided_password.decode('utf-8')
    
    if isinstance(stored_password, bytes):
        stored_password = stored_password.decode('utf-8')
    
    # Use hashpw to compare instead of checkpw which doesn't exist in python_bcrypt    
    return bcrypt.hashpw(provided_password, stored_password) == stored_password

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