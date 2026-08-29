import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// TODO: Replace with your actual Firebase project configuration keys
const firebaseConfig = {
    apiKey: "AIzaSyANc3_PwAzSAoXcReh6PND_9mn7lDZ7OJ4",
    authDomain: "varimitra-1.firebaseapp.com",
    projectId: "varimitra-1",
    storageBucket: "varimitra-1.firebasestorage.app",
    messagingSenderId: "367005747378",
    appId: "1:367005747378:web:f72580afd3765c44b421ab"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

// OpenRouteService API Key centralized here
// TODO: Replace with your actual ORS API Key
const ORS_API_KEY = "YOUR_ORS_API_KEY";

export { app, db, ORS_API_KEY };
