from functools import wraps
from flask import request, jsonify
from app.utils.token_utils import decode_token
from app.database import get_db

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Check if token is in headers
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]  # Bearer <token>
            except IndexError:
                token = auth_header
                
        if not token:
            return jsonify({
                'status': 'error',
                'message': 'Token is missing'
            }), 401

        try:
            # Decode the token
            payload = decode_token(token)
            if not payload:
                raise ValueError('Invalid token')

            # Get user from database
            db = get_db()
            current_user = db.users.find_one({'_id': payload['user_id']})
            
            if not current_user:
                raise ValueError('User not found')

            # Pass the user to the route
            return f(current_user, *args, **kwargs)

        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': 'Invalid token',
                'error': str(e)
            }), 401

    return decorated 