from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
import os
from app.database import init_db, get_db

load_dotenv()

def create_app():
    app = Flask(__name__)
    
    app.config.from_object('app.config.Config')
    
    CORS(app)
    
    init_db(app)
    
    from app.routes.auth_routes import auth_bp
    from app.routes.onboarding_routes import onboarding_bp
    from app.routes.user_routes import user_bp
    
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(onboarding_bp, url_prefix='/api/onboarding')
    app.register_blueprint(user_bp, url_prefix='/api/user')
    
    return app