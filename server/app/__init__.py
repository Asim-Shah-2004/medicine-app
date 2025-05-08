from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
import os
from app.database import init_db, get_db
from app.utils.json_utils import MongoJSONProvider

load_dotenv()

def create_app(config_name='development'):
    app = Flask(__name__)
    
    app.config.from_object('app.config.Config')
    
    # Set the custom JSON provider (Flask 3.1.0+ approach)
    app.json_provider_class = MongoJSONProvider
    app.json = MongoJSONProvider(app)
    
    CORS(app)
    
    init_db(app)
    
    # Import routes
    from app.routes.auth_routes import auth_bp
    from app.routes.onboarding_routes import onboarding_bp
    from app.routes.user_routes import user_bp
    from app.routes.chat_routes import chat_bp
    from app.routes.help import help_bp
    
    # Register blueprints
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(onboarding_bp, url_prefix='/api/onboarding')
    app.register_blueprint(user_bp, url_prefix='/api/user')
    app.register_blueprint(chat_bp, url_prefix='/api/chat')
    app.register_blueprint(help_bp, url_prefix='/api')  # This will handle /api/help
    
    return app