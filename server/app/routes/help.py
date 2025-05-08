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
from twilio.rest import Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

help_bp = Blueprint('help', __name__)
logger = logging.getLogger(__name__)

# Get email configuration from environment variables
EMAIL_USER = os.getenv('USER_EMAIL')
EMAIL_PASSWORD = os.getenv('APP_PASSWORD')

# Get Twilio configuration
TWILIO_ACCOUNT_SID = os.getenv('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.getenv('TWILIO_AUTH_TOKEN')
TWILIO_WHATSAPP_NUMBER = os.getenv('TWILIO_WHATSAPP_NUMBER')

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
        
        # Send notifications to emergency contacts
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
    Send emergency notifications to all emergency contacts via email and WhatsApp
    
    Args:
        emergency_contacts: List of emergency contact objects
        user_profile: User profile data
        transcription: Transcribed audio message
        coordinates: Location coordinates
        
    Returns:
        List of notification results
    """
    results = []
    
    # Prepare the emergency message
    user_name = user_profile.get('name', 'A user')
    health_info = user_profile.get('health_info', {})
    
    # Create detailed message with all relevant information
    message = f"EMERGENCY ALERT: {user_name} needs immediate help!\n\n"
    
    if transcription:
        message += f"Message from {user_name}: {transcription}\n\n"
    
    # Add health information if available
    if health_info:
        message += "Health Information:\n"
        if 'conditions' in health_info and health_info['conditions']:
            message += f"- Medical Conditions: {', '.join(health_info['conditions'])}\n"
        if 'allergies' in health_info and health_info['allergies']:
            message += f"- Allergies: {', '.join(health_info['allergies'])}\n"
        if 'blood_type' in health_info:
            message += f"- Blood Type: {health_info['blood_type']}\n"
        if 'medications' in health_info and health_info['medications']:
            message += f"- Current Medications: {', '.join(health_info['medications'])}\n"
        message += "\n"
    
    # Add location information if available
    if coordinates:
        lat = coordinates.get('latitude')
        lng = coordinates.get('longitude')
        message += f"Location: https://maps.google.com/?q={lat},{lng}\n\n"
    
    message += "This is an automated emergency alert. Please respond immediately."
    
    # For each emergency contact
    for contact in emergency_contacts:
        contact_result = {
            'name': contact.get('name'),
            'email_sent': False,
            'whatsapp_sent': False
        }
        
        # Send email notification
        if 'email' in contact and contact['email']:
            try:
                email_sent = send_emergency_email(
                    contact['email'],
                    contact['name'],
                    user_name,
                    message
                )
                contact_result['email_sent'] = email_sent
            except Exception as e:
                logger.error(f"Failed to send email to {contact['email']}: {str(e)}")
        
        # Send WhatsApp notification (Indian numbers)
        if 'phone' in contact and contact['phone']:
            try:
                # Format phone number for WhatsApp (add India country code if needed)
                phone = contact['phone']
                # Ensure phone number starts with country code
                if phone.startswith('+'):
                    whatsapp_number = phone
                else:
                    # Remove leading zero if present
                    if phone.startswith('0'):
                        phone = phone[1:]
                    # Add India country code (+91)
                    whatsapp_number = f"+91{phone}"
                
                whatsapp_sent = send_whatsapp_message(
                    whatsapp_number,
                    message
                )
                contact_result['whatsapp_sent'] = whatsapp_sent
            except Exception as e:
                logger.error(f"Failed to send WhatsApp to {contact['phone']}: {str(e)}")
        
        results.append(contact_result)
    
    return results

def send_emergency_email(to_email, to_name, user_name, message_body):
    """Send emergency email to a contact"""
    if not EMAIL_USER or not EMAIL_PASSWORD:
        logger.error("Email credentials not configured")
        return False
    
    try:
        # Create message
        msg = MIMEMultipart()
        msg['From'] = EMAIL_USER
        msg['To'] = to_email
        msg['Subject'] = f"EMERGENCY ALERT: {user_name} needs immediate help!"
        
        # Add personalized greeting
        body = f"Dear {to_name},\n\n{message_body}"
        msg.attach(MIMEText(body, 'plain'))
        
        # Connect to Gmail SMTP server
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASSWORD)
        
        # Send email
        server.send_message(msg)
        server.quit()
        
        logger.info(f"Emergency email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send emergency email: {str(e)}")
        return False

def send_whatsapp_message(to_whatsapp, message_body):
    """Send WhatsApp message to a contact using Twilio"""
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not TWILIO_WHATSAPP_NUMBER:
        logger.error("Twilio credentials not configured")
        return False
    
    try:
        # Initialize Twilio client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        # Format WhatsApp number for Twilio (whatsapp:+91XXXXXXXXXX)
        from_whatsapp = f"whatsapp:{TWILIO_WHATSAPP_NUMBER}"
        to_whatsapp_formatted = f"whatsapp:{to_whatsapp}"
        
        # Send message
        message = client.messages.create(
            body=message_body,
            from_=from_whatsapp,
            to=to_whatsapp_formatted
        )
        
        logger.info(f"Emergency WhatsApp sent to {to_whatsapp} (SID: {message.sid})")
        return True
    except Exception as e:
        logger.error(f"Failed to send WhatsApp message: {str(e)}")
        return False 