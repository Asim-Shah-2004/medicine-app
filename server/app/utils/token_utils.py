import jwt
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, current_app
from app.config import Config

def generate_token(user_id, token_type='access'):
    """
    Generate a JWT token for authentication
    """
    if token_type == 'access':
        expires_delta = timedelta(seconds=Config.JWT_ACCESS_TOKEN_EXPIRES)
    else:  
        expires_delta = timedelta(seconds=Config.JWT_REFRESH_TOKEN_EXPIRES)
    
    expire_time = datetime.utcnow() + expires_delta
    
    payload = {
        'user_id': str(user_id),
        'exp': expire_time,
        'iat': datetime.utcnow(),
        'type': token_type
    }
    
    token = jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm='HS256')
    
    return token

def decode_token(token):
    """
    Decode and validate a JWT token
    Returns the payload if valid, None if invalid
    """
    try:
        payload = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def token_required(f):
    """
    Decorator for routes that require valid authentication token
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'message': 'Authentication token is missing'}), 401
        
        payload = decode_token(token)
        if not payload:
            return jsonify({'message': 'Invalid or expired token'}), 401
        
        if payload.get('type') != 'access':
            return jsonify({'message': 'Invalid token type'}), 401
        
        kwargs['user_id'] = payload.get('user_id')
        
        return f(*args, **kwargs)
    
    return decorated

def refresh_token_required(f):
    """
    Decorator for refresh token endpoint
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'message': 'Refresh token is missing'}), 401
        
        payload = decode_token(token)
        if not payload:
            return jsonify({'message': 'Invalid or expired refresh token'}), 401
        
        if payload.get('type') != 'refresh':
            return jsonify({'message': 'Invalid token type'}), 401
        
        kwargs['user_id'] = payload.get('user_id')
        
        return f(*args, **kwargs)
    
    return decorated