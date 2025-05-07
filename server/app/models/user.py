from app.database import get_db
from bson.objectid import ObjectId
from datetime import datetime

class User:
    """
    User model class to interact with MongoDB users collection
    """
    
    @staticmethod
    def create(user_data):
        """
        Create a new user in the database
        """
        db = get_db()
        user_data['created_at'] = datetime.utcnow()
        user_data['updated_at'] = datetime.utcnow()
        
        # Set default values for onboarding status
        user_data['onboarding_complete'] = False
        user_data['onboarding_step'] = 1
        
        # Initialize empty medicines array
        user_data['medicines'] = []
        
        # Insert user and return the generated ID
        result = db.users.insert_one(user_data)
        return str(result.inserted_id)
    
    @staticmethod
    def get_by_id(user_id):
        """
        Retrieve a user by their ID
        """
        db = get_db()
        user = db.users.find_one({'_id': ObjectId(user_id)})
        return user
    
    @staticmethod
    def get_by_email(email):
        """
        Retrieve a user by their email
        """
        db = get_db()
        return db.users.find_one({'email': email})
    
    @staticmethod
    def get_by_username(username):
        """
        Retrieve a user by their username
        """
        db = get_db()
        return db.users.find_one({'username': username})
    
    @staticmethod
    def update(user_id, update_data):
        """
        Update a user's information
        """
        db = get_db()
        update_data['updated_at'] = datetime.utcnow()
        
        result = db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$set': update_data}
        )
        
        return result.modified_count > 0
    
    @staticmethod
    def update_onboarding_status(user_id, step, complete=False):
        """
        Update user's onboarding status
        """
        db = get_db()
        update_data = {
            'onboarding_step': step,
            'onboarding_complete': complete,
            'updated_at': datetime.utcnow()
        }
        
        result = db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$set': update_data}
        )
        
        return result.modified_count > 0
        
    @staticmethod
    def add_medicine(user_id, medicine_data):
        """
        Add a new medicine to user's medicine list
        """
        db = get_db()
        
        # Add IDs and timestamps
        medicine_data['_id'] = ObjectId()
        medicine_data['created_at'] = datetime.utcnow()
        medicine_data['updated_at'] = datetime.utcnow()
        medicine_data['history'] = []
        
        result = db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$push': {'medicines': medicine_data}}
        )
        
        return result.modified_count > 0, str(medicine_data['_id'])
        
    @staticmethod
    def update_medicine(user_id, medicine_id, update_data):
        """
        Update an existing medicine
        """
        db = get_db()
        update_data['updated_at'] = datetime.utcnow()
        
        # Create update fields
        update_fields = {}
        for key, value in update_data.items():
            update_fields[f'medicines.$.{key}'] = value
        
        result = db.users.update_one(
            {
                '_id': ObjectId(user_id),
                'medicines._id': ObjectId(medicine_id)
            },
            {'$set': update_fields}
        )
        
        return result.modified_count > 0
        
    @staticmethod
    def delete_medicine(user_id, medicine_id):
        """
        Remove a medicine from user's medicine list
        """
        db = get_db()
        
        result = db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$pull': {'medicines': {'_id': ObjectId(medicine_id)}}}
        )
        
        return result.modified_count > 0
        
    @staticmethod
    def update_medicine_status(user_id, medicine_id, completed):
        """
        Mark a medicine as taken or not taken
        
        Args:
            user_id: The ID of the user
            medicine_id: The ID of the medicine
            completed: Boolean indicating if medicine was taken
        
        Returns:
            bool: True if successfully updated, False otherwise
        """
        try:
            db = get_db()
            today = datetime.now().strftime('%Y-%m-%d')
            current_time = datetime.now().strftime('%H:%M')
            
            # Prepare the history entry
            history_entry = {
                'date': today,
                'time': current_time,
                'completed': completed
            }
            
            # Find the medicine in user's medicines array
            user = db.users.find_one(
                {
                    '_id': ObjectId(user_id),
                    'medicines._id': ObjectId(medicine_id)
                }
            )
            
            if not user:
                return False
                
            # Check if there's an entry for today and update it, or add a new one
            result = db.users.update_one(
                {
                    '_id': ObjectId(user_id),
                    'medicines._id': ObjectId(medicine_id)
                },
                {
                    '$push': {
                        'medicines.$.history': history_entry
                    },
                    '$set': {
                        'medicines.$.last_status': completed,
                        'medicines.$.last_taken': datetime.now() if completed else None
                    }
                }
            )
            
            return result.modified_count > 0
            
        except Exception as e:
            print(f"Error updating medicine status: {str(e)}")
            return False

"""
Example Medicine Schema:
{
    "_id": ObjectId(),
    "name": "Medication Name",
    "dosage": "10mg",
    "time": "08:00",  # 24-hour format
    "frequency": "daily",  # Options: daily, weekly, monthly, specific_dates
    "days": ["monday", "wednesday", "friday"],  # For weekly frequency
    "days_of_month": [1, 15],  # For monthly frequency
    "dates": ["2025-05-01", "2025-05-15"],  # For specific_dates frequency
    "notes": "Take with food",
    "created_at": datetime,
    "updated_at": datetime,
    "history": [
        {
            "date": "2025-05-01",
            "timestamp": datetime,
            "completed": true
        }
    ],
    "last_status": true,  # Quick access to last completion status
    "last_taken": datetime  # Timestamp of last taken medicine
}
"""