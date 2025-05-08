"""
Emergency Email Test Script

This script will test your emergency notification system by sending a test emergency email.

Usage:
    python test_emergency_email.py test@example.com
    
    Replace test@example.com with the email address you want to test.
"""

import os
import sys
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
import socket
import time
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def check_email_config():
    """Check if the email configuration is valid"""
    load_dotenv()
    email_user = os.getenv('USER_EMAIL')
    email_password = os.getenv('APP_PASSWORD')
    
    if not email_user:
        logger.error("USER_EMAIL not found in .env file")
        return False, "USER_EMAIL not found in .env file"
    
    if not email_password:
        logger.error("APP_PASSWORD not found in .env file")
        return False, "APP_PASSWORD not found in .env file"
    
    # Check if email has valid format
    if '@' not in email_user:
        logger.error(f"USER_EMAIL does not look like a valid email address: {email_user}")
        return False, f"USER_EMAIL does not look like a valid email address: {email_user}"
    
    return True, None

def check_internet_connection():
    """Check if internet connection is available"""
    try:
        # Try to connect to Google's DNS
        socket.create_connection(("8.8.8.8", 53), timeout=3)
        return True
    except OSError:
        return False

def test_email(to_email, contact_name="Test Contact"):
    """Send a test emergency email using Gmail with HTML formatting"""
    # Load environment variables
    load_dotenv()
    
    # Get email configuration
    email_user = os.getenv('USER_EMAIL')
    email_password = os.getenv('APP_PASSWORD')
    
    if not email_user or not email_password:
        logger.error("Email credentials not properly configured in .env file")
        logger.error("Please make sure you have USER_EMAIL and APP_PASSWORD in your .env file")
        return False
    
    try:
        logger.info(f"Attempting to send email to {to_email} using {email_user}")
        
        # Create message
        msg = MIMEMultipart('alternative')
        msg['From'] = f"MediTracker Emergency <{email_user}>"
        msg['To'] = to_email
        msg['Subject'] = "🚨 EMERGENCY ALERT TEST - MediTracker App"
        msg['X-Priority'] = '1'  # Set high priority
        msg['Importance'] = 'high'  # Set importance
        
        # Add reply-to header to improve deliverability
        msg['Reply-To'] = email_user
        
        # Also BCC the sender to ensure message is sent and for troubleshooting
        if email_user:
            msg['Bcc'] = email_user
        
        # Create test coordinates for map
        test_coordinates = {"latitude": 28.6139, "longitude": 77.2090}  # New Delhi coordinates
        lat = test_coordinates["latitude"]
        lng = test_coordinates["longitude"]
        maps_url = f"https://maps.google.com/?q={lat},{lng}"
        
        # Create plain text version (fallback)
        plain_text = f"""
EMERGENCY ALERT TEST - MediTracker App

Dear {contact_name},

This is a TEST emergency alert from your MediTracker app.

If you are receiving this email, your emergency notification system is working correctly!

This would contain vital health information and location data in a real emergency.

Test Location: https://maps.google.com/?q={lat},{lng}

---
This is an automated test message. No action is required.
"""
        
        # Create HTML version with styling
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Emergency Alert Test</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #d32f2f; color: white; padding: 20px; border-radius: 5px; margin-bottom: 30px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">🚨 TEST EMERGENCY ALERT 🚨</h1>
                <p style="font-size: 18px; margin-top: 10px; margin-bottom: 0;">MediTracker Emergency System Test</p>
            </div>
            
            <div style="margin-bottom: 25px;">
                <p style="font-size: 16px;">Dear {contact_name},</p>
                <p style="font-size: 16px; background-color: #ffebee; padding: 15px; border-radius: 5px;">
                    This is a <strong>TEST</strong> emergency alert from your MediTracker app.
                </p>
            </div>
            
            <div style="margin-bottom: 25px; background-color: #f5f5f5; padding: 15px; border-radius: 5px; border-left: 4px solid #ff9800;">
                <h3 style="color: #ff9800; margin-top: 0;">📝 Test Message</h3>
                <p style="color: #333;">If you are receiving this email, your emergency notification system is working correctly!</p>
                <p style="color: #333;">This would contain vital health information in a real emergency.</p>
            </div>
            
            <div style="margin-bottom: 25px; background-color: #e8f5e9; padding: 15px; border-radius: 5px; border-left: 4px solid #388e3c;">
                <h3 style="color: #388e3c; margin-top: 0;">🏥 Sample Health Information</h3>
                <ul style="color: #333; margin-bottom: 0;">
                    <li><strong>Medical Conditions:</strong> Sample diabetes, hypertension</li>
                    <li><strong>Allergies:</strong> Sample penicillin, peanuts</li>
                    <li><strong>Blood Type:</strong> O+</li>
                    <li><strong>Current Medications:</strong> Sample insulin, atenolol</li>
                </ul>
            </div>
            
            <div style="margin-bottom: 25px;">
                <h3 style="color: #d32f2f; margin-bottom: 10px;">📍 Test Location</h3>
                <a href="{maps_url}" target="_blank" style="display: inline-block; background-color: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    View on Google Maps
                </a>
                <p style="margin-top: 10px; color: #555;">Coordinates: {lat}, {lng} (New Delhi)</p>
            </div>
            
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 30px;">
                <p style="margin: 0; color: #555; font-size: 14px;">This is an automated test message from MediTracker.</p>
                <p style="margin-top: 10px; color: #d32f2f; font-weight: bold;">No action is required!</p>
            </div>
        </body>
        </html>
        """
        
        # Attach parts
        part1 = MIMEText(plain_text, 'plain')
        part2 = MIMEText(html, 'html')
        msg.attach(part1)
        msg.attach(part2)
        
        # Connect to Gmail SMTP server with debugging
        logger.info("Connecting to SMTP server...")
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.set_debuglevel(1)  # Enable detailed SMTP transaction logging
        
        logger.info("Starting TLS encryption...")
        server.starttls()
        
        # Log authentication attempt
        logger.info(f"Authenticating with SMTP server using {email_user}...")
        server.login(email_user, email_password)
        
        # Send email
        logger.info(f"Sending email message...")
        server.send_message(msg)
        logger.info(f"Email sent successfully!")
        server.quit()
        
        logger.info(f"Test email sent successfully to {to_email}")
        print(f"\n✅ Email test successful! Check {to_email} for the test message.")
        
        # Remind to check spam
        print(f"\n⚠️ IMPORTANT: If you don't see the email in your inbox, check your SPAM folder!")
        print(f"   The emergency styling might trigger spam filters in some email services.")
        
        return True
    except smtplib.SMTPAuthenticationError as auth_error:
        logger.error(f"SMTP Authentication Error: {str(auth_error)}")
        print(f"\n❌ Email test failed: Authentication Error")
        print("\nThis usually means:")
        print("1. Your APP_PASSWORD is incorrect")
        print("2. You're using your regular Google password instead of an App Password")
        print("3. 2-factor authentication is enabled but you haven't created an App Password")
        print("\nTo fix this issue:")
        print("1. Visit https://myaccount.google.com/apppasswords")
        print("2. Generate a new App Password for your app")
        print("3. Update your .env file with the new APP_PASSWORD")
        return False
    except smtplib.SMTPSenderRefused as sender_error:
        logger.error(f"SMTP Sender Refused: {str(sender_error)}")
        print(f"\n❌ Email test failed: Sender Refused")
        print("\nThis usually means:")
        print("1. Your email provider is blocking the sending of this email")
        print("2. The from address format is invalid")
        return False
    except smtplib.SMTPRecipientsRefused as recipient_error:
        logger.error(f"SMTP Recipients Refused: {str(recipient_error)}")
        print(f"\n❌ Email test failed: Recipient Refused")
        print("\nThis usually means the recipient email address is invalid or your email")
        print("provider won't deliver to this address.")
        return False
    except smtplib.SMTPDataError as data_error:
        logger.error(f"SMTP Data Error: {str(data_error)}")
        print(f"\n❌ Email test failed: Data Error")
        print("\nThe SMTP server refused to accept the message data.")
        print("This might be due to email content being flagged as suspicious.")
        return False
    except smtplib.SMTPConnectError as connect_error:
        logger.error(f"SMTP Connect Error: {str(connect_error)}")
        print(f"\n❌ Email test failed: Connection Error")
        print("\nFailed to connect to the SMTP server. Check your internet connection.")
        return False
    except smtplib.SMTPException as smtp_error:
        logger.error(f"SMTP Error: {str(smtp_error)}")
        print(f"\n❌ Email test failed: SMTP Error - {str(smtp_error)}")
        return False
    except Exception as e:
        logger.error(f"Failed to send test email: {str(e)}")
        logger.error(traceback.format_exc())
        print(f"\n❌ Email test failed. Error: {str(e)}")
        print(f"\nDetailed error information has been written to the log.")
        return False

if __name__ == "__main__":
    print("\n=== Emergency Email Notification Test ===\n")
    
    # Check if internet connection is available
    if not check_internet_connection():
        print("❌ ERROR: No internet connection detected.")
        print("Please check your internet connection and try again.")
        sys.exit(1)
    
    # Check email configuration
    config_valid, error_msg = check_email_config()
    if not config_valid:
        print(f"❌ ERROR: {error_msg}")
        print("Please check your .env file and update the email configuration.")
        sys.exit(1)
    
    # Get email address from command line or prompt
    if len(sys.argv) > 1:
        email = sys.argv[1]
    else:
        email = input("Enter the email address to test: ")
    
    # Check if email address is valid
    if '@' not in email:
        print(f"❌ ERROR: '{email}' doesn't look like a valid email address.")
        print("Please provide a valid email address and try again.")
        sys.exit(1)
    
    # Run the email test
    print(f"\nSending test emergency email to {email}...")
    start_time = time.time()
    email_success = test_email(email)
    end_time = time.time()
    
    # Print summary
    print("\n=== Test Summary ===")
    if email_success:
        print("✅ Email Test: SUCCESS")
        print(f"   Time taken: {end_time - start_time:.2f} seconds")
        print("\nYour emergency email notification system is operational.")
        print("In a real emergency, contacts will receive emails with:")
        print("  - Red alert styling")
        print("  - Clickable Google Maps location button")
        print("  - Health information formatted in sections")
        print("  - Transcribed voice message (if available)")
        
        print("\n⚠️ SPAM FILTER NOTE:")
        print("Sometimes emergency emails may be filtered to spam/junk folders.")
        print("Advise your emergency contacts to:")
        print("1. Check their spam/junk folders")
        print("2. Add your sender email to their contacts list")
        print("3. Mark any test messages as 'Not Spam' if found in spam folder")
    else:
        print("❌ Email Test: FAILED")
        print("\nPlease check the error messages above and fix any configuration issues.")
        print("Common solutions:")
        print("1. Make sure USER_EMAIL and APP_PASSWORD are in your .env file")
        print("2. For Gmail, use an App Password (not your regular password)")
        print("3. Check your internet connection")
        print("4. Make sure SMTP port 587 isn't blocked by your firewall") 