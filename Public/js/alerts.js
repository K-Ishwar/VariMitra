import { db } from './config.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const templates = {
    'flood': {
        en: 'FLOOD WARNING: Due to rising water levels, all Dindis must immediately move to higher ground. Stay away from riverbanks.',
        mr: 'पूर चेतावणी: पाण्याची पातळी वाढत असल्यामुळे, सर्व दिंड्यांनी तात्काळ उंच जमिनीवर जावे.'
    },
    'accident': {
        en: '⚠️ ALERT: Major road accident reported ahead. Expect severe delays.',
        mr: '⚠️ अलर्ट: पुढे मोठा रस्ते अपघात झाल्याचे वृत्त आहे. प्रवासास विलंब होऊ शकतो.'
    },
    'route': {
        en: '🔄 NOTICE: Route has been temporarily changed due to unforeseen circumstances. Follow police directions.',
        mr: '🔄 सूचना: काही अपरिहार्य कारणास्तव मार्ग तात्पुरता बदलण्यात आला आहे. पोलिसांच्या सूचनांचे पालन करा.'
    },
    'camp': {
        en: '⛺ UPDATE: The upcoming resting camp is closed. Proceed to the next designated area.',
        mr: '⛺ अपडेट: पुढील मुक्काम बंद आहे. कृपया पुढच्या निर्धारित ठिकाणी जा.'
    }
};

export async function dispatchAlertLogic(mode, audience, messageEn, messageMr) {
    try {
        let targets = [];
        
        // Query Firestore based on audience
        // For hackathon, we query Dindi Leaders regardless of 'audience' value as per prompt 5.3
        const q = query(collection(db, 'users'), where('role', '==', 'dindi_leader'));
        const querySnapshot = await getDocs(q);
        
        let count = 0;
        querySnapshot.forEach((doc) => {
            if (count >= 5) return; // Hard cap to 5 for safety
            const data = doc.data();
            // Use phone if available, fallback to username (as prompt noted username was used for phone, though we know username is name now)
            const phone = data.phone || data.username;
            if (phone) {
                targets.push(phone);
                count++;
            }
        });

        if (targets.length === 0) {
            console.warn("No targets found to dispatch alert to.");
            return false;
        }

        const payload = {
            mode: mode,
            target: audience,
            messageEn: messageEn,
            messageMr: messageMr,
            phoneNumbers: targets,
            channels: { WA: true }
        };

        const response = await fetch('http://localhost:3000/api/alerts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            console.log("Alert dispatched to backend successfully:", data);
            return { success: true, data: data, count: data.targeted || targets.length };
        } else {
            console.error("Failed to dispatch alert. Status:", response.status);
            return { success: false, error: 'Backend error' };
        }

    } catch (error) {
        console.error("Exception in dispatchAlertLogic:", error);
        return { success: false, error: error.message };
    }
}
