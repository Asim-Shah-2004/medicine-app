from app.models.user import User
from app.utils.password_utils import hash_password, check_password, validate_password
from app.utils.token_utils import generate_token
from email_validator import validate_email, EmailNotValidError

class AuthService:
    """
    Service for authentication-related operations
    """
    
    @staticmethod
    def register_user(user_data):
        """
        Register a new user
        Returns (success, message or user_id, status_code)
        """
        required_fields = ['email', 'password', 'username', 'first_name', 'last_name']
        for field in required_fields:
            if field not in user_data or not user_data[field]:
                return False, f"Missing required field: {field}", 400
        
        try:
            valid_email = validate_email(user_data['email'])
            user_data['email'] = valid_email.email  
        except EmailNotValidError as e:
            return False, str(e), 400
        
        if User.get_by_email(user_data['email']):
            return False, "Email already registered", 409
    
        if User.get_by_username(user_data['username']):
            return False, "Username already taken", 409
        
        is_valid, password_message = validate_password(user_data['password'])
        if not is_valid:
            return False, password_message, 400
        
        user_data['password'] = hash_password(user_data['password'])
        
        user_id = User.create(user_data)
        
        return True, user_id, 201
    
    @staticmethod
    def login(login_data):
        """
        Authenticate a user
        Returns (success, data, status_code)
        """
        if 'email' not in login_data or 'password' not in login_data:
            return False, "Email and password are required", 400
        
        user = User.get_by_email(login_data['email'])
        if not user:
            return False, "Invalid email or password", 401
        
        if not check_password(login_data['password'], user['password']):
            return False, "Invalid email or password", 401
    
        access_token = generate_token(user['_id'], 'access')
        refresh_token = generate_token(user['_id'], 'refresh')
        
        response_data = {
            'user_id': str(user['_id']),
            'username': user['username'],
            'email': user['email'],
            'first_name': user['first_name'],
            'last_name': user['last_name'],
            'onboarding_complete': user.get('onboarding_complete', False),
            'onboarding_step': user.get('onboarding_step', 1),
            'access_token': access_token,
            'refresh_token': refresh_token
        }
        
        return True, response_data, 200
    
    @staticmethod
    def refresh_tokens(user_id):
        """
        Generate new access and refresh tokens
        """
        user = User.get_by_id(user_id)
        if not user:
            return False, "User not found", 404
        
        access_token = generate_token(user['_id'], 'access')
        refresh_token = generate_token(user['_id'], 'refresh')
        
        response_data = {
            'access_token': access_token,
            'refresh_token': refresh_token
        }
        
        return True, response_data, 200