from app.database import get_db
from bson.objectid import ObjectId
from datetime import datetime, timedelta
import pytz

class UserService:
    """
    Service for user-related operations
    """
    
    @staticmethod
    def get_user_profile(user_id):
        """
        Get user profile information
        Returns (success, data, status_code)
        """
        db = get_db()
        
        user = db.users.find_one({'_id': ObjectId(user_id)})
        
        if not user:
            return False, "User not found", 404
        
        # Remove sensitive data
        user.pop('password', None)
        user['_id'] = str(user['_id'])
        
        return True, user, 200
    
    @staticmethod
    def update_user_profile(user_id, profile_data):
        """
        Update user profile information
        Returns (success, data, status_code)
        """
        db = get_db()
        
        # Ensure password is not updated through this method
        if 'password' in profile_data:
            profile_data.pop('password')
        
        # Ensure email and username cannot be changed if they already exist
        if 'email' in profile_data or 'username' in profile_data:
            existing_user = db.users.find_one({'_id': ObjectId(user_id)})
            if not existing_user:
                return False, "User not found", 404
                
            if 'email' in profile_data and profile_data['email'] != existing_user.get('email'):
                # Check if email already exists
                if db.users.find_one({'email': profile_data['email'], '_id': {'$ne': ObjectId(user_id)}}):
                    return False, "Email already in use", 400
            
            if 'username' in profile_data and profile_data['username'] != existing_user.get('username'):
                # Check if username already exists
                if db.users.find_one({'username': profile_data['username'], '_id': {'$ne': ObjectId(user_id)}}):
                    return False, "Username already in use", 400
        
        # Update user profile
        result = db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$set': profile_data}
        )
        
        if result.modified_count == 0:
            return False, "No changes made to profile", 304
        
        updated_user = db.users.find_one({'_id': ObjectId(user_id)})
        updated_user.pop('password', None)
        updated_user['_id'] = str(updated_user['_id'])
        
        return True, updated_user, 200
    
    @staticmethod
    def get_user_medicines(user_id):
        """
        Get all medicines for a user
        Returns (success, data, status_code)
        """
        db = get_db()
        
        user = db.users.find_one({'_id': ObjectId(user_id)})
        
        if not user:
            return False, "User not found", 404
        
        medicines = user.get('medicines', [])
        
        # Convert ObjectId to string
        for medicine in medicines:
            if '_id' in medicine:
                medicine['_id'] = str(medicine['_id'])
        
        return True, {'medicines': medicines}, 200
    
    @staticmethod
    def get_today_medicines(user_id):
        """
        Get medicines scheduled for today
        Returns (success, data, status_code)
        """
        db = get_db()
        
        user = db.users.find_one({'_id': ObjectId(user_id)})
        
        if not user:
            return False, "User not found", 404
        
        medicines = user.get('medicines', [])
        today = datetime.now().strftime('%Y-%m-%d')
        today_medicines = []
        
        for medicine in medicines:
            # Check if medicine should be taken today based on schedule
            if UserService._is_scheduled_today(medicine):
                # Add to today's list
                medicine_copy = medicine.copy()
                if '_id' in medicine_copy:
                    medicine_copy['_id'] = str(medicine_copy['_id'])
                today_medicines.append(medicine_copy)
        
        # Sort by time
        today_medicines.sort(key=lambda x: x.get('time', '00:00'))
        
        return True, {'medicines': today_medicines}, 200
    
    @staticmethod
    def add_medicine(user_id, medicine_data):
        """
        Add a new medicine to user's schedule
        Returns (success, data, status_code)
        """
        db = get_db()
        
        # Validate required fields
        required_fields = ['name', 'dosage', 'time', 'frequency']
        for field in required_fields:
            if field not in medicine_data:
                return False, f"Missing required field: {field}", 400
        
        # Generate a new ObjectId for the medicine
        medicine_data['_id'] = ObjectId()
        
        # Set default values
        medicine_data['created_at'] = datetime.now()
        medicine_data['updated_at'] = datetime.now()
        
        # Add dosage history array
        medicine_data['history'] = []
        
        # Update user document
        result = db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$push': {'medicines': medicine_data}}
        )
        
        if result.modified_count == 0:
            return False, "Failed to add medicine", 500
        
        # Convert ObjectId to string for response
        medicine_data['_id'] = str(medicine_data['_id'])
        
        return True, medicine_data, 201
    
    @staticmethod
    def update_medicine(user_id, medicine_id, medicine_data):
        """
        Update an existing medicine
        Returns (success, data, status_code)
        """
        db = get_db()
        
        # Remove fields that should not be updated directly
        if 'created_at' in medicine_data:
            medicine_data.pop('created_at')
        if 'history' in medicine_data:
            medicine_data.pop('history')
        
        # Set updated timestamp
        medicine_data['updated_at'] = datetime.now()
        
        # Create update object for each field in medicine_data
        update_dict = {}
        for key, value in medicine_data.items():
            update_dict[f'medicines.$.{key}'] = value
        
        # Update medicine
        result = db.users.update_one(
            {
                '_id': ObjectId(user_id),
                'medicines._id': ObjectId(medicine_id)
            },
            {'$set': update_dict}
        )
        
        if result.matched_count == 0:
            return False, "Medicine not found", 404
        
        if result.modified_count == 0:
            return False, "No changes made to medicine", 304
        
        # Get updated medicine
        user = db.users.find_one(
            {
                '_id': ObjectId(user_id),
                'medicines._id': ObjectId(medicine_id)
            },
            {'medicines.$': 1}
        )
        
        if not user or 'medicines' not in user or len(user['medicines']) == 0:
            return False, "Failed to retrieve updated medicine", 500
        
        updated_medicine = user['medicines'][0]
        updated_medicine['_id'] = str(updated_medicine['_id'])
        
        return True, updated_medicine, 200
    
    @staticmethod
    def delete_medicine(user_id, medicine_id):
        """
        Delete a medicine from user's schedule
        Returns (success, data, status_code)
        """
        db = get_db()
        
        # Delete medicine
        result = db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$pull': {'medicines': {'_id': ObjectId(medicine_id)}}}
        )
        
        if result.matched_count == 0:
            return False, "User not found", 404
        
        if result.modified_count == 0:
            return False, "Medicine not found", 404
        
        return True, {"message": "Medicine deleted successfully"}, 200
    
    @staticmethod
    def update_medicine_status(user_id, medicine_id, completed):
        """
        Mark a medicine as taken or not taken
        Returns (success, data, status_code)
        """
        db = get_db()
        
        # Get current date and time
        now = datetime.now()
        today = now.strftime('%Y-%m-%d')
        
        # Create history entry
        history_entry = {
            'date': today,
            'timestamp': now,
            'completed': completed
        }
        
        # Update medicine status and add to history
        result = db.users.update_one(
            {
                '_id': ObjectId(user_id),
                'medicines._id': ObjectId(medicine_id)
            },
            {
                '$push': {'medicines.$.history': history_entry},
                '$set': {'medicines.$.last_status': completed}
            }
        )
        
        if result.matched_count == 0:
            return False, "Medicine not found", 404
        
        if result.modified_count == 0:
            return False, "Failed to update medicine status", 500
        
        return True, {"message": "Medicine status updated successfully"}, 200
    
    @staticmethod
    def get_medicine_schedule(user_id, start_date=None, end_date=None):
        """
        Get medicine schedule for calendar view
        Returns (success, data, status_code)
        """
        db = get_db()
        
        user = db.users.find_one({'_id': ObjectId(user_id)})
        
        if not user:
            return False, "User not found", 404
        
        medicines = user.get('medicines', [])
        
        # If no date range provided, default to current week
        if not start_date:
            today = datetime.now()
            start_of_week = today - timedelta(days=today.weekday())
            start_date = start_of_week.strftime('%Y-%m-%d')
        
        if not end_date:
            start_datetime = datetime.strptime(start_date, '%Y-%m-%d')
            end_datetime = start_datetime + timedelta(days=6)  # 7-day view
            end_date = end_datetime.strftime('%Y-%m-%d')
        
        schedule = UserService._generate_schedule(medicines, start_date, end_date)
        
        return True, {'schedule': schedule, 'start_date': start_date, 'end_date': end_date}, 200
    
    @staticmethod
    def get_today_progress(user_id):
        """
        Get today's medicine completion progress
        Returns (success, data, status_code)
        """
        db = get_db()
        
        user = db.users.find_one({'_id': ObjectId(user_id)})
        
        if not user:
            return False, "User not found", 404
        
        medicines = user.get('medicines', [])
        today = datetime.now().strftime('%Y-%m-%d')
        
        today_medicines = []
        completed_count = 0
        
        for medicine in medicines:
            if UserService._is_scheduled_today(medicine):
                today_medicines.append(medicine)
                
                # Check if medicine was taken today
                if UserService._is_completed_today(medicine):
                    completed_count += 1
        
        total_count = len(today_medicines)
        progress = 0 if total_count == 0 else (completed_count / total_count) * 100
        
        result = {
            'total': total_count,
            'completed': completed_count,
            'pending': total_count - completed_count,
            'progress': progress
        }
        
        return True, result, 200
    
    @staticmethod
    def _is_scheduled_today(medicine):
        """Helper method to determine if medicine is scheduled for today"""
        today = datetime.now()
        today_str = today.strftime('%Y-%m-%d')
        
        # Check frequency type
        frequency = medicine.get('frequency', 'daily')
        
        if frequency == 'daily':
            return True
        
        elif frequency == 'weekly':
            days = medicine.get('days', [])
            return today.strftime('%A').lower() in [day.lower() for day in days]
        
        elif frequency == 'monthly':
            days_of_month = medicine.get('days_of_month', [])
            return today.day in days_of_month
        
        elif frequency == 'specific_dates':
            dates = medicine.get('dates', [])
            return today_str in dates
        
        return False
    
    @staticmethod
    def _is_completed_today(medicine):
        """Helper method to check if medicine was taken today"""
        today = datetime.now().strftime('%Y-%m-%d')
        
        history = medicine.get('history', [])
        for entry in history:
            if entry.get('date') == today and entry.get('completed', False):
                return True
        
        return False
    
    @staticmethod
    def _generate_schedule(medicines, start_date, end_date):
        """Helper method to generate schedule for date range"""
        start_datetime = datetime.strptime(start_date, '%Y-%m-%d')
        end_datetime = datetime.strptime(end_date, '%Y-%m-%d')
        
        # Create empty schedule
        schedule = {}
        
        # For each day in the range
        current_date = start_datetime
        while current_date <= end_datetime:
            date_str = current_date.strftime('%Y-%m-%d')
            schedule[date_str] = []
            
            # For each medicine
            for medicine in medicines:
                # Check if medicine is scheduled for this date
                if UserService._is_scheduled_for_date(medicine, current_date):
                    medicine_copy = {
                        'id': str(medicine['_id']),
                        'name': medicine['name'],
                        'dosage': medicine['dosage'],
                        'time': medicine['time']
                    }
                    
                    # Check if it was completed on this date
                    medicine_copy['completed'] = UserService._is_completed_on_date(medicine, date_str)
                    
                    schedule[date_str].append(medicine_copy)
            
            # Sort by time
            schedule[date_str].sort(key=lambda x: x.get('time', '00:00'))
            
            # Move to next day
            current_date += timedelta(days=1)
        
        return schedule
    
    @staticmethod
    def _is_scheduled_for_date(medicine, date):
        """Helper method to determine if medicine is scheduled for a specific date"""
        frequency = medicine.get('frequency', 'daily')
        
        if frequency == 'daily':
            return True
        
        elif frequency == 'weekly':
            days = medicine.get('days', [])
            return date.strftime('%A').lower() in [day.lower() for day in days]
        
        elif frequency == 'monthly':
            days_of_month = medicine.get('days_of_month', [])
            return date.day in days_of_month
        
        elif frequency == 'specific_dates':
            dates = medicine.get('dates', [])
            return date.strftime('%Y-%m-%d') in dates
        
        return False
    
    @staticmethod
    def _is_completed_on_date(medicine, date_str):
        """Helper method to check if medicine was taken on a specific date"""
        history = medicine.get('history', [])
        for entry in history:
            if entry.get('date') == date_str and entry.get('completed', False):
                return True
        
        return False