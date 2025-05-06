from flask import Blueprint, request, jsonify
from app.services.onboarding_service import OnboardingService
from app.utils.token_utils import token_required

onboarding_bp = Blueprint('onboarding', __name__)

@onboarding_bp.route('/status', methods=['GET'])
@token_required
def get_status(user_id):
    """
    Get current onboarding status
    """
    success, result, status_code = OnboardingService.get_onboarding_status(user_id)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@onboarding_bp.route('/profile/basic', methods=['POST'])
@token_required
def update_basic_profile(user_id):
    """
    Update basic profile information (Step 1)
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'message': 'No input data provided'}), 400
    
    success, result, status_code = OnboardingService.update_basic_profile(user_id, data)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@onboarding_bp.route('/profile/health', methods=['POST'])
@token_required
def update_health_profile(user_id):
    """
    Update health profile information (Step 2)
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'message': 'No input data provided'}), 400
    
    success, result, status_code = OnboardingService.update_health_profile(user_id, data)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@onboarding_bp.route('/medications', methods=['POST'])
@token_required
def add_medications(user_id):
    """
    Add medications to user profile (Step 3)
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'message': 'No input data provided'}), 400
    
    success, result, status_code = OnboardingService.add_medications(user_id, data)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code

@onboarding_bp.route('/complete', methods=['POST'])
@token_required
def complete_onboarding(user_id):
    """
    Mark onboarding as complete
    """
    success, result, status_code = OnboardingService.complete_onboarding(user_id)
    
    if success:
        return jsonify(result), status_code
    else:
        return jsonify({'message': result}), status_code