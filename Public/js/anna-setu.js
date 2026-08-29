import { db } from './config.js';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, getDoc, serverTimestamp, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let currentUser = {};
let currentRole = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Check auth state from localStorage
    const role = localStorage.getItem('userRole');
    if (!role) {
        window.location.href = 'index.html';
        return;
    }
    
    currentRole = role;
    currentUser = {
        id: localStorage.getItem('userId'),
        name: localStorage.getItem('userName'),
        username: localStorage.getItem('userPhone') || localStorage.getItem('userId'), // use userPhone
        role: role
    };

    const welcomeEl = document.getElementById('welcomeMessage');
    if (welcomeEl && currentUser.name) {
        welcomeEl.innerText = `Welcome, ${currentUser.name}!`;
    }

    document.getElementById('view-loading').style.display = 'none';

    if (currentRole === 'dindi_leader' || currentRole === 'dindi_helper') {
        document.getElementById('view-leader').style.display = 'block';
        loadLeaderView();
    } else {
        // Assume Donor/Public role
        document.getElementById('view-donor').style.display = 'block';
        loadDonorView();
    }
});

// ==========================================
// DONOR VIEW LOGIC
// ==========================================

window.switchDonorTab = function(tab) {
    document.getElementById('tab-explore').classList.remove('active');
    document.getElementById('tab-requests').classList.remove('active');
    document.getElementById('donor-explore').classList.remove('active');
    document.getElementById('donor-requests').classList.remove('active');

    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('donor-' + tab).classList.add('active');

    if (tab === 'explore') {
        const list = document.getElementById('stops-list');
        list.innerHTML = '<div style="text-align:center; padding:20px; color:#7a6d54;">Enter a date and location to find nearby Dindis.</div>';
    }
    if (tab === 'requests') loadDonorRequests();
};

async function loadDonorView() {
    const list = document.getElementById('stops-list');
    list.innerHTML = '<div style="text-align:center; padding:20px; color:#7a6d54;">Enter a date and location to find nearby Dindis.</div>';
}

// Helper: Haversine distance in km
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Helper: Format 24h time to 12h AM/PM
function formatTime12h(time24) {
    if (!time24) return '';
    const [h, m] = time24.split(':');
    let hours = parseInt(h, 10);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${m} ${suffix}`;
}

let donorSearchTimeout;
window.searchDonorLoc = function(query) {
    const resultsEl = document.getElementById('donorLocResults');
    if (query.trim().length < 3) {
        resultsEl.style.display = 'none';
        return;
    }
    
    clearTimeout(donorSearchTimeout);
    donorSearchTimeout = setTimeout(async () => {
        try {
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&bbox=72.5,15.5,81.0,22.1`;
            const res = await fetch(url);
            const data = await res.json();
            
            resultsEl.innerHTML = '';
            if (!data.features || data.features.length === 0) {
                resultsEl.style.display = 'none';
                return;
            }
            
            data.features.forEach(feature => {
                const props = feature.properties;
                const coords = feature.geometry.coordinates; // [lon, lat]
                
                const name = props.name || "Unknown";
                const sub = [props.county, props.state].filter(Boolean).join(', ');
                const lat = coords[1];
                const lng = coords[0];
                
                const divItem = document.createElement('div');
                divItem.style.padding = '10px 15px';
                divItem.style.borderBottom = '1px solid #f1f5f9';
                divItem.style.cursor = 'pointer';
                divItem.innerHTML = `<strong>${name}</strong> <span style="color:#9a8d75;font-size:12px;">${sub}</span>`;
                
                divItem.onclick = () => {
                    document.getElementById('searchLoc').value = name;
                    document.getElementById('searchLocCoords').value = JSON.stringify({lat, lng});
                    resultsEl.style.display = 'none';
                };
                resultsEl.appendChild(divItem);
            });
            resultsEl.style.display = 'block';
        } catch(e) {
            console.error('Geocoder error:', e);
        }
    }, 400); // Debounce to prevent API rate limiting
};

window.searchSevaPoints = async function() {
    const searchDateStr = document.getElementById('searchDate').value;
    const coordsStr = document.getElementById('searchLocCoords').value;
    const list = document.getElementById('stops-list');
    
    if (!searchDateStr || !coordsStr) {
        alert("Please select both a date and a location.");
        return;
    }

    list.innerHTML = '<div style="text-align:center; padding:20px; color:#7a6d54;">Searching routes...</div>';

    const searchDate = new Date(searchDateStr);
    searchDate.setHours(0,0,0,0);
    const donorCoords = JSON.parse(coordsStr);
    
    try {
        // Fetch routes from dindiRoutes collection instead of users
        const snapshot = await getDocs(collection(db, "dindiRoutes"));
        
        let foundStops = [];

        for (const docSnap of snapshot.docs) {
            const route = docSnap.data();
            const leaderId = docSnap.id;
            if (!route.dayCoords || !route.startDate) continue;

            const routeStartDate = new Date(route.startDate);
            routeStartDate.setHours(0,0,0,0);

            // Check each day's stop
            for (let i = 0; i < route.dayCoords.length; i++) {
                const dayPlan = route.dayCoords[i];
                // Calculate the date of this specific day (index i = Day i+1)
                const stopDate = new Date(routeStartDate);
                stopDate.setDate(stopDate.getDate() + i);

                // If dates match exactly and there is an end coordinate
                if (stopDate.getTime() === searchDate.getTime() && dayPlan.end) {
                    const dist = calculateDistance(donorCoords.lat, donorCoords.lng, dayPlan.end.lat, dayPlan.end.lng);
                    
                    foundStops.push({
                        id: leaderId + '_' + i,
                        dindiId: leaderId,
                        location: dayPlan.endName || 'Unknown Village',
                        distance: dist.toFixed(1),
                        date: stopDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
                    });
                }
            }
        }

        // Fetch leader details for the found stops to attach leaderName/Phone
        for (let stop of foundStops) {
            const userSnap = await getDoc(doc(db, "users", stop.dindiId));
            if (userSnap.exists()) {
                const leaderData = userSnap.data();
                stop.leaderName = leaderData.name || 'Unknown Leader';
                stop.leaderPhone = leaderData.username || 'N/A';
                stop.dindiName = leaderData.dindiName || 'Unknown Dindi';
            } else {
                stop.leaderName = 'Unknown';
                stop.leaderPhone = 'N/A';
                stop.dindiName = 'Unknown Dindi';
            }
        }

        list.innerHTML = '';
        
        if (foundStops.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">No active Dindi stops found on the selected date anywhere in the state.</div>';
            return;
        }

        // Sort by closest distance
        foundStops.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

        let stopsToDisplay = foundStops.filter(s => parseFloat(s.distance) <= 25);
        let fallbackWarning = '';

        // If no stops are within 25km, show ONLY the absolute closest one as a fallback
        if (stopsToDisplay.length === 0) {
            stopsToDisplay = [foundStops[0]];
            fallbackWarning = `
                <div style="background-color: #fef3c7; color: #b45309; padding: 12px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; border: 1px solid #fde68a;">
                    <strong>Notice:</strong> No Dindi stops were found within 25km. Showing the absolute closest active stop on this date.
                </div>
            `;
        }

        list.innerHTML += fallbackWarning;

        stopsToDisplay.forEach(stop => {
            const safeLocation = stop.location.replace(/'/g, "\\'");
            list.innerHTML += `
                <div class="card">
                    <div class="card-header" style="border-bottom:none; margin-bottom:0; padding-bottom:0;">
                        <div>
                            <h4 class="card-title">${stop.dindiName}</h4>
                            <p class="card-subtitle">Leader: ${stop.leaderName}</p>
                            <p class="card-subtitle" style="color:var(--marigold-deep); font-weight:600; margin-top:8px;">
                                📍 ${stop.location} (${stop.distance} km away)
                            </p>
                        </div>
                    </div>
                    <button class="action-btn" onclick="openDonateModal('${stop.id}', '${stop.dindiId}', '${safeLocation}', '${stop.dindiName}')">Offer Donation to this Dindi</button>
                </div>
            `;
        });

    } catch(e) {
        console.error(e);
        list.innerHTML = '<div style="color:red; text-align:center;">Failed to search routes</div>';
    }
};

window.openDonateModal = function(stopId, dindiId, locationName, dindiName) {
    document.getElementById('modalStopId').value = stopId;
    document.getElementById('modalDindiId').value = dindiId;
    document.getElementById('modalLocationName').value = locationName;
    document.getElementById('modalDindiName').value = dindiName;
    document.getElementById('modalStopName').textContent = 'Location: ' + locationName;
    
    document.getElementById('donateModal').classList.add('active');
};

window.closeDonateModal = function() {
    document.getElementById('donateModal').classList.remove('active');
    document.getElementById('modalQuantity').value = '';
    document.getElementById('modalHr').value = '5';
    document.getElementById('modalMin').value = '00';
    document.getElementById('modalAmPm').value = 'PM';
};

window.submitDonation = async function() {
    const stopId = document.getElementById('modalStopId').value;
    const dindiId = document.getElementById('modalDindiId').value;
    const locationName = document.getElementById('modalLocationName').value;
    const dindiName = document.getElementById('modalDindiName').value;
    const itemType = document.getElementById('modalItemType').value;
    const quantity = document.getElementById('modalQuantity').value;
    
    let hr = parseInt(document.getElementById('modalHr').value, 10);
    const min = document.getElementById('modalMin').value;
    const ampm = document.getElementById('modalAmPm').value;

    if (ampm === 'PM' && hr !== 12) hr += 12;
    if (ampm === 'AM' && hr === 12) hr = 0;
    
    const time = `${hr.toString().padStart(2, '0')}:${min}`;

    if (!quantity || !time) {
        alert("Please fill all fields.");
        return;
    }
    
    if (time < "17:00") {
        alert("As Dindi stops for rest only in the evening, please propose a time after 5:00 PM (17:00).");
        return;
    }

    try {
        await addDoc(collection(db, "donations"), {
            stopId: stopId,
            dindiId: dindiId,
            donorId: currentUser.id || currentUser.username,
            donorName: currentUser.name,
            donorPhone: currentUser.username, // Using username as phone
            dindiName: dindiName || 'Unknown Dindi',
            locationName: locationName || 'Unknown Location',
            itemType: itemType,
            quantity: quantity,
            proposedTime: time,
            status: 'pending', // pending, accepted, rejected, completed
            createdAt: serverTimestamp()
        });

        alert("Donation request sent! Waiting for leader approval.");
        closeDonateModal();
        switchDonorTab('requests'); // Switch to requests tab to see status
    } catch(e) {
        console.error(e);
        alert("Failed to submit donation request.");
    }
};

async function loadDonorRequests() {
    const list = document.getElementById('requests-list-donor');
    list.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Loading requests...</div>';
    
    try {
        const q = query(collection(db, "donations"), where("donorId", "==", currentUser.id || currentUser.username));
        const snapshot = await getDocs(q);
        
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">You have no active requests.</div>';
            return;
        }

        snapshot.forEach(docSnap => {
            const req = docSnap.data();
            let badgeClass = 'pending';
            let badgeText = 'Pending Approval';
            let extraAction = '';

            if (req.status === 'accepted') {
                badgeClass = '';
                badgeText = 'Accepted ✓';
                extraAction = `<button class="action-btn success" onclick="viewContact('${req.dindiId}')">View Leader Contact</button>`;
            } else if (req.status === 'rejected') {
                badgeClass = 'rejected';
                badgeText = 'Rejected';
                extraAction = `<p style="font-size:12px; color:#94a3b8; margin-top:10px;">Please try another nearby stop.</p>`;
            } else if (req.status === 'completed') {
                badgeClass = '';
                badgeText = 'Completed ✓✓';
            }

            list.innerHTML += `
                <div class="card" style="border-left: 4px solid var(--marigold); transition: transform 0.2s;">
                    <div class="card-header">
                        <div>
                            <div class="card-title">📦 ${req.itemType}: ${req.quantity}</div>
                            <div class="card-subtitle" style="margin-top: 4px;">🕒 Proposed Time: <b>${formatTime12h(req.proposedTime)}</b></div>
                        </div>
                        <span class="badge ${badgeClass}">${badgeText}</span>
                    </div>
                    ${extraAction}
                </div>
            `;
        });
    } catch(e) {
        console.error(e);
        list.innerHTML = '<div style="color:red; text-align:center;">Failed to load requests</div>';
    }
}

window.viewContact = async function(dindiId) {
    try {
        const userDoc = await getDoc(doc(db, "users", dindiId));
        
        if (userDoc.exists()) {
            const leader = userDoc.data();
            const photoHtml = leader.photo ? `<img src="${leader.photo}" alt="Leader Photo">` : `<div style="width:50px; height:50px; border-radius:25px; background:var(--saffron-vivid); display:flex; align-items:center; justify-content:center; font-weight:bold; color:white;">${leader.name.charAt(0)}</div>`;
            
            document.getElementById('contactDetailsHtml').innerHTML = `
                <div class="leader-profile">
                    ${photoHtml}
                    <div>
                        <div style="font-weight:600; color:var(--ink);">${leader.name}</div>
                        <div style="font-size:13px; color:#7a6d54;">Phone: ${leader.username}</div>
                    </div>
                </div>
            `;
            document.getElementById('contactModal').classList.add('active');
        } else {
            alert("Contact details not found.");
        }
    } catch(e) {
        console.error(e);
        alert("Error fetching contact details.");
    }
};

window.closeContactModal = function() {
    document.getElementById('contactModal').classList.remove('active');
};


// ==========================================
// LEADER VIEW LOGIC
// ==========================================

window.switchLeaderTab = function(tab) {
    document.getElementById('tab-incoming').classList.remove('active');
    document.getElementById('tab-accepted').classList.remove('active');
    document.getElementById('leader-incoming').classList.remove('active');
    document.getElementById('leader-accepted').classList.remove('active');

    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('leader-' + tab).classList.add('active');

    if (tab === 'incoming') loadLeaderIncoming();
    if (tab === 'accepted') loadLeaderAccepted();
};

async function loadLeaderView() {
    await loadLeaderIncoming();
}

async function loadLeaderIncoming() {
    const list = document.getElementById('incoming-list');
    list.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Loading incoming...</div>';
    
    try {
        const dindiId = currentUser.id || currentUser.username;

        const q = query(collection(db, "donations"), where("dindiId", "==", dindiId));
        const snapshot = await getDocs(q);
        
        list.innerHTML = '';
        let hasPending = false;

        snapshot.forEach(docSnap => {
            const req = docSnap.data();
            if (req.status !== 'pending') return;
            hasPending = true;

            list.innerHTML += `
                <div class="card" id="req-${docSnap.id}" style="border-left: 4px solid var(--vermilion); transition: transform 0.2s;">
                    <div class="card-header">
                        <div>
                            <div class="card-title">👤 ${req.donorName}</div>
                            <div class="card-subtitle">📞 ${req.donorPhone}</div>
                        </div>
                        <span class="badge pending">Pending</span>
                    </div>
                    <div style="font-size:14px; margin-bottom:12px; background: var(--paper-2); padding: 10px; border-radius: 8px;">
                        <b style="color: var(--ink);">📦 ${req.itemType}:</b> ${req.quantity}<br>
                        <b style="color: var(--ink);">🕒 Time:</b> ${formatTime12h(req.proposedTime)}
                    </div>
                    <div class="btn-row">
                        <button class="action-btn danger" onclick="updateDonationStatus('${docSnap.id}', 'rejected', '${req.donorPhone}')">Reject</button>
                        <button class="action-btn success" onclick="updateDonationStatus('${docSnap.id}', 'accepted', '${req.donorPhone}')">Accept</button>
                    </div>
                </div>
            `;
        });

        if (!hasPending) {
            list.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">No pending requests.</div>';
        }
    } catch(e) {
        console.error(e);
        list.innerHTML = '<div style="color:red; text-align:center;">Failed to load incoming</div>';
    }
}

async function loadLeaderAccepted() {
    const list = document.getElementById('accepted-list');
    list.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Loading accepted...</div>';
    
    try {
        const dindiId = currentUser.id || currentUser.username;
        const q = query(collection(db, "donations"), where("dindiId", "==", dindiId));
        const snapshot = await getDocs(q);
        
        list.innerHTML = '';
        let hasAccepted = false;

        snapshot.forEach(docSnap => {
            const req = docSnap.data();
            if (req.status !== 'accepted') return;
            hasAccepted = true;

            list.innerHTML += `
                <div class="card" style="border-left: 4px solid var(--sage); transition: transform 0.2s;">
                    <div class="card-header">
                        <div>
                            <div class="card-title">👤 ${req.donorName}</div>
                            <div class="card-subtitle">📞 ${req.donorPhone}</div>
                        </div>
                        <span class="badge" style="background:#dcfce7; color:#166534;">Accepted ✓</span>
                    </div>
                    <div style="font-size:14px; margin-bottom:12px; background: var(--paper-2); padding: 10px; border-radius: 8px;">
                        <b style="color: var(--ink);">📦 ${req.itemType}:</b> ${req.quantity}<br>
                        <b style="color: var(--ink);">🕒 Time:</b> ${formatTime12h(req.proposedTime)}
                    </div>
                    <div class="btn-row">
                        <a href="https://wa.me/91${req.donorPhone}" target="_blank" class="action-btn secondary" style="display:flex; justify-content:center; align-items:center; text-decoration:none;">💬 WhatsApp</a>
                        <button class="action-btn success" onclick="updateDonationStatus('${docSnap.id}', 'completed', '${req.donorPhone}')">Mark Received</button>
                    </div>
                </div>
            `;
        });

        if (!hasAccepted) {
            list.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">No accepted requests for today.</div>';
        }
    } catch(e) {
        console.error(e);
        list.innerHTML = '<div style="color:red; text-align:center;">Failed to load accepted</div>';
    }
}

window.updateDonationStatus = async function(docId, newStatus, donorPhone) {
    try {
        // Update Firestore
        await updateDoc(doc(db, "donations", docId), {
            status: newStatus
        });

        // Hide card instantly
        const reqCard = document.getElementById(`req-${docId}`);
        if(reqCard) reqCard.style.display = 'none';

        // Trigger SMS notification to donor (Commented out to avoid errors since no backend is set up)
        /*
        if (newStatus === 'accepted' || newStatus === 'rejected') {
            await fetch('/api/donations/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: donorPhone,
                    status: newStatus,
                    details: 'Notification regarding your donation request.'
                })
            });
        }
        */

        alert(`Donation marked as ${newStatus}`);
    } catch(e) {
        console.error(e);
        alert("Failed to update status.");
    }
};
