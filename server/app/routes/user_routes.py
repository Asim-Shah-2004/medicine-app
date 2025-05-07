from flask import Blueprint, request, jsonify
from app.services.user_service import UserService
from app.utils.token_utils import token_required

user_bp = Blueprint('user', __name__)

@user_bp.route('/profile', methods=['GET'])
@token_required
def get_profile(user_id):
    """
    Get user profile information
    """
    success, result, status_code = UserService.get_user_profile(user_id)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@user_bp.route('/profile', methods=['PUT'])
@token_required
def update_profile(user_id):
    """
    Update user profile information
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'message': 'No input data provided'}), 400
    
    success, result, status_code = UserService.update_user_profile(user_id, data)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@user_bp.route('/medicines', methods=['GET'])
@token_required
def get_medicines(user_id):
    """
    Get all medicines for a user
    """
    success, result, status_code = UserService.get_user_medicines(user_id)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@user_bp.route('/medicines/today', methods=['GET'])
@token_required
def get_today_medicines(user_id):
    """
    Get medicines scheduled for today
    """
    success, result, status_code = UserService.get_today_medicines(user_id)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@user_bp.route('/medicines', methods=['POST'])
@token_required
def add_medicine(user_id):
    """
    Add a new medicine to user's schedule
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'message': 'No input data provided'}), 400
    
    success, result, status_code = UserService.add_medicine(user_id, data)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@user_bp.route('/medicines/<medicine_id>', methods=['PUT'])
@token_required
def update_medicine(user_id, medicine_id):
    """
    Update an existing medicine
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'message': 'No input data provided'}), 400
    
    success, result, status_code = UserService.update_medicine(user_id, medicine_id, data)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@user_bp.route('/medicines/<medicine_id>', methods=['DELETE'])
@token_required
def delete_medicine(user_id, medicine_id):
    """
    Delete a medicine from user's schedule
    """
    success, result, status_code = UserService.delete_medicine(user_id, medicine_id)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@user_bp.route('/medicines/<medicine_id>/status', methods=['POST'])
@token_required
def update_medicine_status(user_id, medicine_id):
    """
    Mark a medicine as taken or not taken
    """
    data = request.get_json()
    
    if not data or 'completed' not in data:
        return jsonify({'message': 'Completed status is required'}), 400
    
    success, result, status_code = UserService.update_medicine_status(user_id, medicine_id, data['completed'])
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@user_bp.route('/medicines/schedule', methods=['GET'])
@token_required
def get_schedule(user_id):
    """
    Get medicine schedule for calendar view
    """
    # Optional query parameters for date range
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    success, result, status_code = UserService.get_medicine_schedule(user_id, start_date, end_date)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@user_bp.route('/medicines/progress', methods=['GET'])
@token_required
def get_today_progress(user_id):
    """
    Get today's medicine completion progress
    """
    success, result, status_code = UserService.get_today_progress(user_id)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code