from flask import Blueprint, request, jsonify
from app.models.user import User
from app.database import get_db
import logging
import os
from datetime import datetime
import tempfile
import speech_recognition as sr
from pydub import AudioSegment
import io

help_bp = Blueprint('help', __name__)
logger = logging.getLogger(__name__)

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
            'status': 'pending'
        }
        
        db.emergency_requests.insert_one(emergency_request)
        
        return jsonify({
            'status': 'success',
            'message': 'Emergency help request processed successfully',
            'data': {
                'transcription': transcription
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error processing emergency help request: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to process emergency help request',
            'error': str(e)
        }), 500 