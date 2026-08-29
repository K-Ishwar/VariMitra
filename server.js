require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');
const twilio = require('twilio');

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyANc3_PwAzSAoXcReh6PND_9mn7lDZ7OJ4",
    authDomain: "varimitra-1.firebaseapp.com",
    projectId: "varimitra-1",
    storageBucket: "varimitra-1.firebasestorage.app",
    messagingSenderId: "367005747378",
    appId: "1:367005747378:web:f72580afd3765c44b421ab"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────
// WhatsApp via WA Gateway (fireclashpro.com)
// Sends fully custom messages to any number
// ─────────────────────────────────────────────
async function sendWhatsApp(phone, message) {
    try {
        const apiKey   = process.env.FIRECLASH_API_KEY;
        const sessionId = process.env.FIRECLASH_SESSION;

        if (!apiKey || !sessionId) {
            console.warn('[WA] Missing FIRECLASH_API_KEY or FIRECLASH_SESSION in .env');
            return false;
        }

        // E.164 format without +, e.g. 917709820100
        let formattedPhone = String(phone).replace('+', '').trim();
        if (!formattedPhone.startsWith('91')) {
            formattedPhone = '91' + formattedPhone;
        }

        const response = await fetch('https://waapi.fireclashpro.com/api/v1/messages/send', {
            method: 'POST',
            headers: {
                'X-API-Key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                recipient:  formattedPhone,
                message:    message
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            console.log(`[WA] Sent to ${formattedPhone}`);
            return true;
        } else {
            console.error(`[WA] Failed:`, result);
            return false;
        }
    } catch (error) {
        console.error('[WA] Exception:', error.message);
        return false;
    }
}

// ─────────────────────────────────────────────
// SMS via Twilio (pre-approved template only)
// Template: "VariMitra Alert: <messageEn>"
// ─────────────────────────────────────────────
async function sendSMS(phone, messageEn) {
    try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken  = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;

        if (!accountSid || !authToken || !fromNumber) {
            console.warn('[SMS] Missing Twilio credentials in .env');
            return false;
        }

        // E.164 format with +
        let formattedPhone = String(phone).trim();
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+91' + formattedPhone.replace(/^91/, '');
        }

        const client = twilio(accountSid, authToken);

        // Twilio trial accounts MUST use this exact pre-approved template body
        const templateBody = 'sms_appointment_reminders';

        const result = await client.messages.create({
            from: fromNumber,
            to:   formattedPhone,
            body: templateBody
        });

        console.log(`[SMS] Twilio sent to ${formattedPhone} | SID: ${result.sid}`);
        return true;
    } catch (error) {
        console.error('[SMS] Twilio error:', error.message);
        return false;
    }
}

// ─────────────────────────────────────────────
// POST /api/alerts
// ─────────────────────────────────────────────
app.post('/api/alerts', async (req, res) => {
    try {
        const { mode, messageEn, messageMr, phoneNumbers, channels } = req.body;

        if (mode === 'mock') {
            setTimeout(() => {
                res.json({ targeted: 4500, delivered: 4421, pending: 79, status: 'mock_success' });
            }, 1500);
            return;
        }

        if (mode === 'live') {
            if (!phoneNumbers || phoneNumbers.length === 0) {
                return res.status(400).json({ error: 'No phone numbers provided.' });
            }

            const msgBody = '🚨 VariMitra Emergency Alert 🚨\n\n' + messageEn + '\n\n' + messageMr;

            const sendPromises = [];

            // WhatsApp via WA Gateway — sends custom message
            if (channels && channels.WA) {
                phoneNumbers.forEach(number => {
                    sendPromises.push(sendWhatsApp(number, msgBody));
                });
            }

            // SMS via Twilio — sends pre-approved template
            if (channels && channels.SMS) {
                phoneNumbers.forEach(number => {
                    sendPromises.push(sendSMS(number, messageEn));
                });
            }

            const results = await Promise.allSettled(sendPromises);

            let delivered = 0;
            let pending   = 0;

            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value === true) {
                    delivered++;
                } else {
                    pending++;
                }
            });

            res.json({
                targeted:  phoneNumbers.length,
                delivered: delivered,
                pending:   pending,
                status:    'live_success'
            });
            return;
        }

        res.status(400).json({ error: 'Invalid mode.' });
    } catch (error) {
        console.error('Error in /api/alerts:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Static files
app.use(express.static(path.join(__dirname, 'Public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access the application at http://localhost:${PORT}`);
});
