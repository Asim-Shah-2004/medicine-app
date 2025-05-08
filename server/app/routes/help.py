
from flask import Blueprint, request, jsonify
from app.models.user import User
from app.database import get_db
import logging
import os
import json
from datetime import datetime
import tempfile
import speech_recognition as sr
from pydub import AudioSegment
import io
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
import time
import email.utils

# Load environment variables
load_dotenv()

help_bp = Blueprint('help', __name__)
logger = logging.getLogger(__name__)

# Get email configuration from environment variables
EMAIL_USER = os.getenv('USER_EMAIL')
EMAIL_PASSWORD = os.getenv('APP_PASSWORD')

@help_bp.route('/help', methods=['POST'])
def send_emergency_help():
    """
    Handle emergency help requests with audio messages
    """
    try:
        db = get_db()
        
        # Get the audio file from request
        if 'audio' not in request.files:
            return jsonify({
                'status': 'error',
                'message': 'No audio file provided'
            }), 400
            
        audio_file = request.files['audio']
        should_transcribe = request.form.get('transcribe', 'false').lower() == 'true'

        # Parse coordinates if available
        coordinates = None
        if 'coordinates' in request.form:
            try:
                coordinates = json.loads(request.form['coordinates'])
                logger.info(f"Received coordinates: {coordinates}")
            except Exception as e:
                logger.error(f"Error parsing coordinates: {str(e)}")
        
        # Parse user profile if available
        user_profile = None
        if 'current_user' in request.form:
            try:
                user_profile = json.loads(request.form['current_user'])
                logger.info(f"Received user profile")
            except Exception as e:
                logger.error(f"Error parsing user profile: {str(e)}")

        # Save audio file temporarily and transcribe
        transcription = None
        if should_transcribe:
            try:
                # Save audio file temporarily
                with tempfile.NamedTemporaryFile(delete=False, suffix='.m4a') as temp_audio:
                    audio_file.save(temp_audio)
                    temp_audio.flush()
                    
                    # Convert M4A to WAV using pydub
                    audio = AudioSegment.from_file(temp_audio.name, format="m4a")
                    wav_path = temp_audio.name + ".wav"
                    audio.export(wav_path, format="wav")
                    
                    # Initialize recognizer
                    recognizer = sr.Recognizer()
                    
                    # Read the audio file
                    with sr.AudioFile(wav_path) as source:
                        # Record the audio file
                        audio_data = recognizer.record(source)
                        # Use Google's speech recognition
                        transcription = recognizer.recognize_google(audio_data)
                        logger.info(f"Transcribed emergency message: {transcription}")
                
                # Clean up temp files
                os.unlink(temp_audio.name)
                os.unlink(wav_path)
                
            except sr.UnknownValueError:
                logger.error("Speech Recognition could not understand the audio")
                transcription = "Could not understand the audio message"
            except sr.RequestError as e:
                logger.error(f"Could not request results from Speech Recognition service; {str(e)}")
                transcription = "Error processing audio message"
            except Exception as e:
                logger.error(f"Error transcribing audio: {str(e)}")
                transcription = "Error transcribing audio message"

        # Store emergency request in database
        emergency_request = {
            'timestamp': datetime.utcnow(),
            'transcription': transcription,
            'coordinates': coordinates,
            'status': 'pending'
        }
        
        if user_profile:
            emergency_request['user_id'] = user_profile.get('_id')
            emergency_request['user_name'] = user_profile.get('name')
            emergency_request['user_health_info'] = user_profile.get('health_info')
        
        db.emergency_requests.insert_one(emergency_request)
        
        # Send email notifications to emergency contacts
        notification_results = []
        
        if user_profile and 'emergency_contacts' in user_profile and user_profile['emergency_contacts']:
            notification_results = send_emergency_notifications(
                user_profile['emergency_contacts'],
                user_profile,
                transcription,
                coordinates
            )
            logger.info(f"Sent notifications to {len(notification_results)} emergency contacts")
        else:
            logger.warning("No emergency contacts found in user profile")
        
        return jsonify({
            'status': 'success',
            'message': 'Emergency help request processed successfully',
            'data': {
                'transcription': transcription,
                'notifications_sent': notification_results
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error processing emergency help request: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to process emergency help request',
            'error': str(e)
        }), 500

def send_emergency_notifications(emergency_contacts, user_profile, transcription, coordinates):
    """
    Send emergency email notifications to all emergency contacts
    
    Args:
        emergency_contacts: List of emergency contact objects
        user_profile: User profile data
        transcription: Transcribed audio message
        coordinates: Location coordinates
        
    Returns:
        List of notification results
    """
    results = []
    
    # Prepare the emergency message data
    user_name = user_profile.get('name', 'A user')
    health_info = user_profile.get('health_info', {})
    
    # Track overall success rate
    any_notification_successful = False
    
    # For each emergency contact
    for contact in emergency_contacts:
        contact_result = {
            'name': contact.get('name'),
            'email_sent': False
        }
        
        # Email is our primary and only notification method
        if 'email' in contact and contact['email']:
            try:
                email_sent = send_emergency_email(
                    contact['email'],
                    contact['name'],
                    user_name,
                    transcription,
                    health_info,
                    coordinates
                )
                contact_result['email_sent'] = email_sent
                if email_sent:
                    any_notification_successful = True
                    logger.info(f"Successfully sent emergency email to {contact['name']} at {contact['email']}")
                else:
                    logger.warning(f"Failed to send emergency email to {contact['name']} at {contact['email']}")
            except Exception as e:
                logger.error(f"Exception sending email to {contact['email']}: {str(e)}")
        else:
            logger.warning(f"No email address available for contact: {contact.get('name')}")
        
        results.append(contact_result)
    
    # Log overall success/failure
    if any_notification_successful:
        logger.info("Email notifications sent successfully")
    else:
        logger.error("ALL email notifications failed. Emergency was not delivered!")
    
    return results

def send_emergency_email(to_email, to_name, user_name, transcription, health_info, coordinates):
    """Send enhanced emergency email to a contact with HTML styling"""
    if not EMAIL_USER or not EMAIL_PASSWORD:
        logger.error("Email credentials not configured")
        return False
    
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        
        # Set From header with proper formatting
        from_name = "MediTracker Emergency Alert"
        msg['From'] = f"{from_name} <{EMAIL_USER}>"
        msg['To'] = f"{to_name} <{to_email}>"
        msg['Subject'] = f"🚨 URGENT: Medical Alert from {user_name} via MediTracker"
        
        # Add important email headers to prevent spam filtering
        msg['X-Priority'] = '1'  # Highest priority
        msg['X-MSMail-Priority'] = 'High'
        msg['Importance'] = 'high'
        msg['Precedence'] = 'urgent'
        msg['Reply-To'] = EMAIL_USER
        msg['Message-ID'] = f"<emergency_{int(time.time())}@meditracker.app>"
        msg['Date'] = email.utils.formatdate(localtime=True)
        
        # Add custom headers to indicate legitimate emergency alert
        msg['X-Emergency-Alert'] = 'true'
        msg['X-Auto-Response'] = 'true'
        msg['X-Emergency-Type'] = 'medical'
        msg['X-Emergency-Priority'] = 'high'
        msg['X-Mailer'] = 'MediTracker Emergency System 1.0'
        
        # Add List-Unsubscribe header (helps with spam prevention)
        msg['List-Unsubscribe'] = f"<mailto:{EMAIL_USER}?subject=unsubscribe>"
        msg['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
        
        # Add authentication-results hints
        msg['Authentication-Results'] = f"meditracker.app; spf=pass smtp.mailfrom={EMAIL_USER}"
        
        # Prepare location data for HTML
        location_html = ""
        maps_url = ""
        if coordinates:
            lat = coordinates.get('latitude')
            lng = coordinates.get('longitude')
            maps_url = f"https://maps.google.com/?q={lat},{lng}"
            location_html = f"""
            <div style="margin-bottom: 25px;">
                <h3 style="color: #d32f2f; margin-bottom: 10px;">📍 Last Known Location</h3>
                <a href="{maps_url}" target="_blank" style="display: inline-block; background-color: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    View Location on Google Maps
                </a>
                <p style="margin-top: 10px; color: #555;">GPS Coordinates: {lat}, {lng}</p>
            </div>
            """
        
        # Prepare transcription section with improved styling
        transcription_html = ""
        if transcription:
            transcription_html = f"""
            <div style="margin-bottom: 25px; background-color: #fff3e0; padding: 15px; border-radius: 5px; border-left: 4px solid #ff9800;">
                <h3 style="color: #e65100; margin-top: 0;">📝 Emergency Message</h3>
                <p style="color: #333; font-style: italic; font-size: 16px;">"{transcription}"</p>
            </div>
            """
        
        # Prepare health information section with improved styling
        health_html = ""
        if health_info:
            health_html = """
            <div style="margin-bottom: 25px; background-color: #e8f5e9; padding: 15px; border-radius: 5px; border-left: 4px solid #388e3c;">
                <h3 style="color: #1b5e20; margin-top: 0;">🏥 Important Health Information</h3>
                <ul style="color: #333; margin-bottom: 0; font-size: 15px;">
            """
            
            if 'conditions' in health_info and health_info['conditions']:
                health_html += f"<li><strong>Medical Conditions:</strong> {', '.join(health_info['conditions'])}</li>"
            if 'allergies' in health_info and health_info['allergies']:
                health_html += f"<li><strong>Known Allergies:</strong> {', '.join(health_info['allergies'])}</li>"
            if 'blood_type' in health_info:
                health_html += f"<li><strong>Blood Type:</strong> {health_info['blood_type']}</li>"
            if 'medications' in health_info and health_info['medications']:
                health_html += f"<li><strong>Current Medications:</strong> {', '.join(health_info['medications'])}</li>"
                
            health_html += """
                </ul>
            </div>
            """
        
        # Create plain text version with improved formatting
        plain_text = f"""
URGENT MEDICAL ALERT: {user_name} Needs Immediate Assistance

Dear {to_name},

This is an EMERGENCY alert from MediTracker. {user_name} has triggered their emergency alert system and requires immediate assistance.

"""
        if transcription:
            plain_text += f"EMERGENCY MESSAGE:\n{transcription}\n\n"
            
        if health_info:
            plain_text += "HEALTH INFORMATION:\n"
            if 'conditions' in health_info and health_info['conditions']:
                plain_text += f"- Medical Conditions: {', '.join(health_info['conditions'])}\n"
            if 'allergies' in health_info and health_info['allergies']:
                plain_text += f"- Known Allergies: {', '.join(health_info['allergies'])}\n"
            if 'blood_type' in health_info:
                plain_text += f"- Blood Type: {health_info['blood_type']}\n"
            if 'medications' in health_info and health_info['medications']:
                plain_text += f"- Current Medications: {', '.join(health_info['medications'])}\n"
            plain_text += "\n"
            
        if coordinates:
            lat = coordinates.get('latitude')
            lng = coordinates.get('longitude')
            plain_text += f"LOCATION: https://maps.google.com/?q={lat},{lng}\n\n"
            
        plain_text += """
IMPORTANT: This is a legitimate emergency alert from MediTracker's Emergency Response System.
If you received this message, you are registered as an emergency contact.

To stop receiving these alerts, reply to this email with 'UNSUBSCRIBE' in the subject line.
"""
        
        # Create HTML version with improved structure and styling
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="x-apple-disable-message-reformatting">
            <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
            <title>Emergency Alert</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #d32f2f; color: white; padding: 20px; border-radius: 10px; margin-bottom: 30px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h1 style="margin: 0; font-size: 28px; font-weight: bold;">🚨 EMERGENCY ALERT 🚨</h1>
                <p style="font-size: 20px; margin-top: 10px; margin-bottom: 0;">{user_name} Needs Immediate Help</p>
            </div>
            
            <div style="margin-bottom: 25px;">
                <p style="font-size: 16px;">Dear {to_name},</p>
                <p style="font-size: 16px; background-color: #ffebee; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                    This is an <strong>EMERGENCY ALERT</strong>. {user_name} has activated their emergency response system and requires immediate assistance.
                </p>
            </div>
            
            {transcription_html}
            {health_html}
            {location_html}
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin-top: 30px;">
                <p style="margin: 0; color: #666; font-size: 14px;">This is an automated emergency alert from the MediTracker Emergency Response System.</p>
                <p style="margin-top: 10px; color: #d32f2f; font-weight: bold;">Please respond immediately if you can assist.</p>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
                <p style="color: #666; font-size: 12px; margin: 0;">
                    You are receiving this because you are registered as an emergency contact.<br>
                    To unsubscribe from these alerts, reply with 'UNSUBSCRIBE' in the subject line.
                </p>
            </div>
        </body>
        </html>
        """
        
        # Attach parts
        part1 = MIMEText(plain_text, 'plain', 'utf-8')
        part2 = MIMEText(html, 'html', 'utf-8')
        msg.attach(part1)
        msg.attach(part2)
        
        # Connect to Gmail SMTP server with extended timeout
        server = smtplib.SMTP('smtp.gmail.com', 587, timeout=30)
        server.set_debuglevel(1)  # Enable verbose debug output
        server.starttls()
        
        # Log authentication attempt
        logger.info(f"Authenticating with SMTP server using {EMAIL_USER}")
        server.login(EMAIL_USER, EMAIL_PASSWORD)
        
        # Send email with retry mechanism
        max_retries = 3
        retry_delay = 2  # seconds
        
        for attempt in range(max_retries):
            try:
                server.send_message(msg)
                logger.info(f"Emergency email sent successfully to {to_email}")
                server.quit()
                return True
            except smtplib.SMTPException as e:
                if attempt < max_retries - 1:
                    logger.warning(f"Attempt {attempt + 1} failed, retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                else:
                    raise e
                    
    except smtplib.SMTPAuthenticationError as auth_error:
        logger.error(f"SMTP Authentication Error: {str(auth_error)}")
        logger.error("Please check your email credentials. For Gmail, you need to use an App Password.")
        return False
    except smtplib.SMTPSenderRefused as sender_error:
        logger.error(f"SMTP Sender Refused: {str(sender_error)}")
        logger.error("The sender address was refused. Check if your email provider allows sending from this address.")
        return False
    except smtplib.SMTPRecipientsRefused as recipient_error:
        logger.error(f"SMTP Recipients Refused: {str(recipient_error)}")
        logger.error(f"The recipient address {to_email} was refused. Check if the email address is valid.")
        return False
    except smtplib.SMTPDataError as data_error:
        logger.error(f"SMTP Data Error: {str(data_error)}")
        logger.error("The SMTP server refused to accept the message data.")
        return False
    except smtplib.SMTPConnectError as connect_error:
        logger.error(f"SMTP Connect Error: {str(connect_error)}")
        logger.error("Failed to connect to the SMTP server. Check your internet connection.")
        return False
    except smtplib.SMTPException as smtp_error:
        logger.error(f"SMTP Error: {str(smtp_error)}")
        return False
    except Exception as e:
        logger.error(f"Failed to send emergency email: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        return False


