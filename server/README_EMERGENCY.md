# Emergency Notification System

This document explains how to set up and use the emergency notification system that sends alerts to emergency contacts via email and WhatsApp when a user initiates an emergency request.

## Features

- Speech-to-text transcription of emergency voice messages
- Location tracking to send GPS coordinates to emergency contacts
- Email notifications to emergency contacts
- WhatsApp messages to emergency contacts using Twilio
- Includes user's health information in the emergency notifications

## Setup

### 1. Environment Variables

Copy the `env.example` file to `.env` in the server directory:

```
cp env.example .env
```

Then edit the `.env` file to include your credentials:

### 2. Email Configuration

The system uses Gmail to send emergency emails. You'll need:

1. A Gmail account
2. An App Password (not your regular Gmail password)

To generate an App Password:
1. Go to your Google Account > Security
2. Enable 2-Step Verification if not already enabled
3. Go to App passwords (under "Signing in to Google")
4. Select "Mail" and your device, then generate
5. Copy the 16-character password

Add these to your `.env` file:
```
USER_EMAIL=your_gmail@gmail.com
APP_PASSWORD=your_16_char_app_password
```

### 3. Twilio Configuration for WhatsApp

1. Create a Twilio account at https://www.twilio.com
2. Activate the WhatsApp Sandbox
3. Get your Account SID and Auth Token from the Twilio Console
4. Add these to your `.env` file:
```
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886  # This is the default sandbox number
```

#### WhatsApp Sandbox Setup:
1. Users must opt-in to receive messages. Each contact needs to send a WhatsApp message "join <sandbox-code>" to the Twilio number.
2. For Indian numbers, remember that they should have the +91 country code

### 4. Python Dependencies

Install the required Python packages:

```
pip install python-dotenv twilio
```

## How It Works

1. When a user triggers an emergency from the app, the request goes to `/api/help`
2. The system:
   - Transcribes the voice message
   - Gets the user's location
   - Retrieves the user's emergency contacts and health information
   - Formats a detailed emergency message
   - Sends emails to all emergency contacts
   - Sends WhatsApp messages to all emergency contacts

## Testing

You can test the system with:

1. **Test Email**: Ensure your Gmail and App Password are correctly set
2. **Test WhatsApp**: First activate the WhatsApp Sandbox by sending the join message from your test phone

## Production Considerations

For production:
1. Use a dedicated email service like SendGrid instead of Gmail
2. Upgrade to a paid Twilio WhatsApp account to remove the sandbox limitations
3. Implement message templating for WhatsApp to comply with WhatsApp Business Policies
4. Set up monitoring to track failed notifications

## Troubleshooting

Common issues:
- **Email not sending**: Check Gmail's security settings or use App Password correctly
- **WhatsApp not receiving**: Ensure the contact has sent the join message to the Twilio sandbox
- **Indian numbers**: Ensure all phone numbers have the +91 country code prefix

Check the logs for specific error messages about failed notifications. 