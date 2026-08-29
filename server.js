require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');

// Firebase configuration (Same as frontend)
const firebaseConfig = {
    apiKey: "AIzaSyANc3_PwAzSAoXcReh6PND_9mn7lDZ7OJ4",
    authDomain: "varimitra-1.firebaseapp.com",
    projectId: "varimitra-1",
    storageBucket: "varimitra-1.firebasestorage.app",
    messagingSenderId: "367005747378",
    appId: "1:367005747378:web:f72580afd3765c44b421ab"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- WhatsApp Helper Function ---
async function sendWhatsApp(phone, message) {
    try {
        const greenApiId = process.env.GREEN_API_ID;
        const greenApiToken = process.env.GREEN_API_TOKEN;

        if (!greenApiId || !greenApiToken) {
            console.warn('[WhatsApp] Missing GREEN_API credentials in .env');
            return false;
        }

        // Format phone number
        let formattedPhone = String(phone).replace('+', '');
        if (!formattedPhone.startsWith('91')) {
            formattedPhone = '91' + formattedPhone;
        }

        const url = `https://api.green-api.com/waInstance${greenApiId}/sendMessage/${greenApiToken}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chatId: formattedPhone + '@c.us',
                message: message
            })
        });

        if (response.ok) {
            console.log(`[WhatsApp] Message sent successfully to ${formattedPhone}`);
            return true;
        } else {
            const errorText = await response.text();
            console.error(`[WhatsApp] Failed to send message: ${errorText}`);
            return false;
        }
    } catch (error) {
        console.error('[WhatsApp] Exception while sending message:', error);
        return false;
    }
}

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'Public')));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access the application at http://localhost:${PORT}`);
});
