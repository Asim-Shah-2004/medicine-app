from app.database import get_db
from datetime import datetime
from bson import ObjectId

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