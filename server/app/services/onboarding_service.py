from app.models.user import User

class OnboardingService:
    """
    Service for onboarding-related operations
    """
    
    @staticmethod
    def get_onboarding_status(user_id):
        """
        Get the current onboarding status for a user
        """
        user = User.get_by_id(user_id)
        if not user:
            return False, "User not found", 404
        
        onboarding_info = {
            'onboarding_complete': user.get('onboarding_complete', False),
            'onboarding_step': user.get('onboarding_step', 1)
        }
        
        return True, onboarding_info, 200
    
    @staticmethod
    def update_basic_profile(user_id, profile_data):
        """
        Update basic user profile information (Step 1)
        """
        required_fields = ['date_of_birth', 'gender']
        for field in required_fields:
            if field not in profile_data:
                return False, f"Missing required field: {field}", 400
        
        update_data = {
            'date_of_birth': profile_data['date_of_birth'],
            'gender': profile_data['gender']
        }
        
        if 'phone_number' in profile_data:
            update_data['phone_number'] = profile_data['phone_number']
        
        if not User.update(user_id, update_data):
            return False, "Failed to update profile", 500
        
        User.update_onboarding_status(user_id, 2)
        
        return True, {"message": "Basic profile updated", "next_step": 2}, 200
    
    @staticmethod
    def update_health_profile(user_id, health_data):
        """
        Update health profile information (Step 2)
        """
        if 'health_conditions' not in health_data or not isinstance(health_data['health_conditions'], list):
            return False, "Health conditions must be provided as a list", 400
        
        if 'allergies' not in health_data or not isinstance(health_data['allergies'], list):
            return False, "Allergies must be provided as a list", 400
        
        update_data = {
            'health_profile': {
                'health_conditions': health_data['health_conditions'],
                'allergies': health_data['allergies']
            }
        }
        
        optional_fields = ['height', 'weight', 'blood_type']
        for field in optional_fields:
            if field in health_data:
                update_data['health_profile'][field] = health_data[field]
        
        if not User.update(user_id, update_data):
            return False, "Failed to update health profile", 500
        
        User.update_onboarding_status(user_id, 3)
        
        return True, {"message": "Health profile updated", "next_step": 3}, 200
    
    @staticmethod
    def add_medications(user_id, medication_data):
        """
        Add medications to user profile (Step 3)
        """
        if 'medications' not in medication_data or not isinstance(medication_data['medications'], list):
            return False, "Medications must be provided as a list", 400
        
        for med in medication_data['medications']:
            if 'name' not in med or not med['name']:
                return False, "Each medication must have a name", 400
            
            if 'dosage' not in med or not med['dosage']:
                return False, "Each medication must have a dosage", 400
            
            if 'frequency' not in med or not med['frequency']:
                return False, "Each medication must have a frequency", 400
        
        update_data = {
            'medications': medication_data['medications']
        }
        
        if not User.update(user_id, update_data):
            return False, "Failed to update medications", 500
        
        User.update_onboarding_status(user_id, 4, True)
        
        return True, {"message": "Medications added", "onboarding_complete": True}, 200
    
    @staticmethod
    def complete_onboarding(user_id):
        """
        Mark onboarding as complete
        """

        if not User.update_onboarding_status(user_id, 4, True):
            return False, "Failed to complete onboarding", 500
        
        return True, {"message": "Onboarding completed successfully"}, 200