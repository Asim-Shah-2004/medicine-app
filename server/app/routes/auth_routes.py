from flask import Blueprint, request, jsonify
from app.services.auth_service import AuthService
from app.utils.token_utils import refresh_token_required
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

auth_bp = Blueprint('auth', __name__)

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

@auth_bp.route('/register', methods=['POST'])
@limiter.limit("20 per hour")
def register():
    """
    Register a new user
    """
    
    data = request.get_json()
    print(data)
    if not data:
        return jsonify({'message': 'No input data provided'}), 400
    
    
    success, result, status_code = AuthService.register_user(data)
    
    if success:
        return jsonify({'message': 'User registered successfully', 'user_id': result}), status_code
    else:
        return jsonify({'message': result}), status_code

@auth_bp.route('/login', methods=['POST'])
@limiter.limit("10 per minute")
def login():
    """
    Login and get tokens
    """
    
    data = request.get_json()
    
    if not data:
        return jsonify({'message': 'No input data provided'}), 400
    
    
    success, result, status_code = AuthService.login(data)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@auth_bp.route('/refresh', methods=['POST'])
@limiter.limit("60 per hour")
@refresh_token_required
def refresh(user_id):
    """
    Refresh access and refresh tokens
    """
    
    success, result, status_code = AuthService.refresh_tokens(user_id)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@auth_bp.route('/check-auth', methods=['GET'])
def check_auth():
    """
    Endpoint to check if authentication header is valid
    This is mainly for frontend to validate token
    """
    
    auth_header = request.headers.get('Authorization')
    
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'authenticated': False}), 401
    
    
    return jsonify({'authenticated': True}), 200