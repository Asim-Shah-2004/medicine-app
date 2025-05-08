"""
Email Configuration Diagnostics Tool

This script helps diagnose common issues with email configuration:
1. Checks .env file for required variables
2. Validates environment variables
3. Tests connectivity to Gmail's SMTP server
4. Verifies authentication
5. Provides helpful guidance to resolve issues

Usage:
    python check_email_config.py
"""

import os
import sys
import socket
import logging
import smtplib
from dotenv import load_dotenv
import time
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("email_diagnostics.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def print_status(message, status):
    """Print a status message with colored output"""
    if status == "PASS":
        print(f"✅ {message}")
    elif status == "WARN":
        print(f"⚠️ {message}")
    elif status == "FAIL":
        print(f"❌ {message}")
    else:
        print(f"   {message}")

def check_env_file():
    """Check if .env file exists and contains required variables"""
    print("\n=== Checking .env file ===")
    
    # Check if .env file exists
    if not os.path.exists(".env"):
        print_status("FAIL: .env file not found in current directory", "FAIL")
        print("   Create a .env file with USER_EMAIL and APP_PASSWORD")
        return False
    
    # Check if .env file is readable
    try:
        with open(".env", "r") as f:
            env_contents = f.read()
        print_status("PASS: .env file exists and is readable", "PASS")
    except Exception as e:
        print_status(f"FAIL: Could not read .env file: {str(e)}", "FAIL")
        return False
    
    # Check for email configuration
    has_user_email = "USER_EMAIL" in env_contents
    has_app_password = "APP_PASSWORD" in env_contents
    
    if has_user_email:
        print_status("PASS: USER_EMAIL found in .env file", "PASS")
    else:
        print_status("FAIL: USER_EMAIL not found in .env file", "FAIL")
    
    if has_app_password:
        print_status("PASS: APP_PASSWORD found in .env file", "PASS")
    else:
        print_status("FAIL: APP_PASSWORD not found in .env file", "FAIL")
    
    return has_user_email and has_app_password

def check_env_variables():
    """Check if environment variables are set and valid"""
    print("\n=== Checking environment variables ===")
    
    # Load environment variables
    load_dotenv()
    
    # Check USER_EMAIL
    email_user = os.getenv('USER_EMAIL')
    if not email_user:
        print_status("FAIL: USER_EMAIL environment variable not set", "FAIL")
        email_valid = False
    elif '@' not in email_user:
        print_status(f"FAIL: USER_EMAIL does not look like a valid email: {email_user}", "FAIL")
        email_valid = False
    else:
        print_status(f"PASS: USER_EMAIL is set to {email_user}", "PASS")
        email_valid = True
    
    # Check APP_PASSWORD
    app_password = os.getenv('APP_PASSWORD')
    if not app_password:
        print_status("FAIL: APP_PASSWORD environment variable not set", "FAIL")
        password_valid = False
    elif len(app_password) < 8:
        print_status("WARN: APP_PASSWORD seems too short. For Gmail, should be 16 characters", "WARN")
        password_valid = True  # Still might work
    else:
        print_status("PASS: APP_PASSWORD is set", "PASS")
        password_valid = True
    
    return email_valid and password_valid, email_user, app_password

def check_internet_connection():
    """Check if there's a working internet connection"""
    print("\n=== Checking internet connection ===")
    
    try:
        # Try to connect to Google's DNS
        socket.create_connection(("8.8.8.8", 53), timeout=3)
        print_status("PASS: Internet connection is working", "PASS")
        return True
    except OSError as e:
        print_status(f"FAIL: No internet connection: {str(e)}", "FAIL")
        return False

def check_smtp_connection():
    """Test connection to Gmail's SMTP server"""
    print("\n=== Testing SMTP server connection ===")
    
    try:
        start_time = time.time()
        # Try to connect to Gmail's SMTP server
        smtp = smtplib.SMTP('smtp.gmail.com', 587, timeout=10)
        connection_time = time.time() - start_time
        
        print_status(f"PASS: Connected to smtp.gmail.com:587 in {connection_time:.2f} seconds", "PASS")
        
        # Test EHLO command
        print("   Testing EHLO command...")
        response = smtp.ehlo()
        if response[0] >= 200 and response[0] < 300:
            print_status("PASS: EHLO command successful", "PASS")
        else:
            print_status(f"FAIL: EHLO command failed: {response}", "FAIL")
            smtp.quit()
            return False
        
        # Test STARTTLS command
        print("   Testing STARTTLS command...")
        response = smtp.starttls()
        if response[0] >= 200 and response[0] < 300:
            print_status("PASS: STARTTLS command successful", "PASS")
        else:
            print_status(f"FAIL: STARTTLS command failed: {response}", "FAIL")
            smtp.quit()
            return False
        
        smtp.quit()
        return True
    except socket.timeout:
        print_status("FAIL: Connection to SMTP server timed out", "FAIL")
        print("   This could be due to a slow internet connection or firewall blocking port 587")
        return False
    except socket.gaierror:
        print_status("FAIL: Could not resolve SMTP server hostname", "FAIL")
        print("   This could be due to DNS issues or no internet connection")
        return False
    except Exception as e:
        print_status(f"FAIL: Error connecting to SMTP server: {str(e)}", "FAIL")
        return False

def test_smtp_auth(email_user, app_password):
    """Test SMTP authentication with the given credentials"""
    if not email_user or not app_password:
        print("\n=== Skipping SMTP authentication test (missing credentials) ===")
        return False
    
    print("\n=== Testing SMTP authentication ===")
    
    try:
        # Connect to Gmail's SMTP server
        smtp = smtplib.SMTP('smtp.gmail.com', 587, timeout=10)
        smtp.starttls()
        
        # Try to authenticate
        print(f"   Attempting to authenticate as {email_user}...")
        smtp.login(email_user, app_password)
        
        print_status("PASS: Authentication successful", "PASS")
        print("   Your email credentials are working correctly!")
        
        smtp.quit()
        return True
    except smtplib.SMTPAuthenticationError as e:
        print_status(f"FAIL: Authentication failed: {str(e)}", "FAIL")
        print("\nThis usually means:")
        print("1. Your APP_PASSWORD is incorrect")
        print("2. You're using your regular Google password instead of an App Password")
        print("3. 2-factor authentication is enabled but you haven't created an App Password")
        
        print("\nTo fix this issue:")
        print("1. Visit https://myaccount.google.com/apppasswords")
        print("2. Generate a new App Password for your app")
        print("3. Update your .env file with the new APP_PASSWORD")
        return False
    except Exception as e:
        print_status(f"FAIL: Error during authentication: {str(e)}", "FAIL")
        return False

def print_summary(checks_passed):
    """Print a summary of the checks performed"""
    print("\n=== Summary ===")
    
    if len(checks_passed) == 0:
        print("No checks were completed.")
        return
    
    total_checks = len(checks_passed)
    passed_checks = sum(1 for passed in checks_passed if passed)
    
    print(f"Completed {total_checks} checks, {passed_checks} passed, {total_checks - passed_checks} failed.")
    
    if passed_checks == total_checks:
        print("\n✅ Your email configuration looks good!")
        print("   You should be able to send emergency emails successfully.")
        print("   Run server/test_emergency_email.py to send a test email.")
    else:
        print("\n⚠️ Some checks failed. Please fix the issues above and run this script again.")
        
        if not checks_passed[0]:  # .env file check
            print("\n- Make sure you have a .env file in the server directory")
            print("- The .env file should contain USER_EMAIL and APP_PASSWORD")
        
        if not checks_passed[1]:  # Environment variables check
            print("\n- Check that your .env file is properly formatted")
            print("- USER_EMAIL should be a valid email address (e.g., youremail@gmail.com)")
            print("- APP_PASSWORD should be your Gmail App Password, not your regular password")
        
        if not checks_passed[2]:  # Internet connection check
            print("\n- Check your internet connection")
            print("- Make sure you can access the internet from this machine")
        
        if not checks_passed[3]:  # SMTP connection check
            print("\n- Check if your firewall is blocking outgoing connections to port 587")
            print("- Try running this on a different network if possible")
        
        if len(checks_passed) > 4 and not checks_passed[4]:  # SMTP auth check
            print("\n- For Gmail accounts, you need to:")
            print("  1. Enable 2-factor authentication on your Google account")
            print("  2. Create an App Password at https://myaccount.google.com/apppasswords")
            print("  3. Use that App Password in your .env file")

def main():
    """Run all diagnostics"""
    print("=" * 60)
    print("EMAIL CONFIGURATION DIAGNOSTICS TOOL")
    print("=" * 60)
    
    checks_passed = []
    
    # Check .env file
    env_check = check_env_file()
    checks_passed.append(env_check)
    
    # Check environment variables
    env_vars_check, email_user, app_password = check_env_variables()
    checks_passed.append(env_vars_check)
    
    # Check internet connection
    internet_check = check_internet_connection()
    checks_passed.append(internet_check)
    
    # Skip remaining tests if no internet
    if not internet_check:
        print_summary(checks_passed)
        return
    
    # Check SMTP connection
    smtp_check = check_smtp_connection()
    checks_passed.append(smtp_check)
    
    # Skip authentication test if SMTP connection failed
    if not smtp_check:
        print_summary(checks_passed)
        return
    
    # Test SMTP authentication
    if env_vars_check:
        auth_check = test_smtp_auth(email_user, app_password)
        checks_passed.append(auth_check)
    
    # Print summary
    print_summary(checks_passed)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nDiagnostic tool interrupted by user.")
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        logger.error(traceback.format_exc())
        print(f"\n❌ An unexpected error occurred: {str(e)}")
        print("Check email_diagnostics.log for more details.") 