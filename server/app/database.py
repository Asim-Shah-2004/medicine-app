from pymongo import MongoClient
import os

mongo_client = None
db = None

def init_db(app):
    global mongo_client, db
    
    mongo_uri = os.getenv('MONGO_URI', app.config.get('MONGO_URI'))
    db_name = os.getenv('DB_NAME', app.config.get('DB_NAME'))
    
    mongo_client = MongoClient(mongo_uri)
    db = mongo_client[db_name]
    
    db.users.create_index('email', unique=True)
    db.users.create_index('username', unique=True)
    
    app.logger.info(f"Connected to MongoDB: {db_name}")
    
    return db

def get_db():
    global db
    return db
