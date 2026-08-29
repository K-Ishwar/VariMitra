import { db, ORS_API_KEY } from './config.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const PANDHARPUR = { lat: 17.6799, lng: 75.3266 };
let map = null;

window.initDindiMap = function() {
    if (map) return; // Guard to only run once

    // Initialize map centered on a middle point towards Pandharpur
    map = L.map('dindiMap').setView([18.2, 75.5], 7);

    // OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Styled divIcon for Pandharpur Golden Temple emoji
    const templeIcon = L.divIcon({
        className: 'custom-temple-icon',
        html: '<div style="font-size: 24px; text-align: center; background: white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.2); width: 32px; height: 32px; line-height: 32px; border: 2px solid var(--marigold-deep);">🛕</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });

    L.marker([PANDHARPUR.lat, PANDHARPUR.lng], { icon: templeIcon }).addTo(map)
        .bindTooltip("Pandharpur", { permanent: true, direction: 'right' });
};

window.initDindiLeader = async function() {
    window.initDindiMap();
    
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    
    try {
        const docSnap = await getDoc(doc(db, 'dindiRoutes', userId));
        if (docSnap.exists()) {
            window.loadSavedRoute(docSnap.data());
        }
    } catch (e) {
        console.error("Error loading saved route:", e);
    }
};

window.loadSavedRoute = function(data) {
    document.getElementById('dindiPlannerSetup').style.display = 'none';
    
    const viewContainer = document.getElementById('savedRouteView');
    viewContainer.style.display = 'block';
    
    // Clear old map routes
    if (dayPolylines) {
        for (const key in dayPolylines) {
            if (map && dayPolylines[key]) {
                map.removeLayer(dayPolylines[key]);
            }
        }
    }
    dayPolylines = {};
    
    let html = `<div class="card" style="background: var(--paper-2); padding: 24px;">`;
    html += `<h4 style="margin-top:0; font-size: 20px; color: var(--marigold-deep);">Your Saved Route Plan</h4>`;
    html += `<p style="font-size: 14px; margin-bottom: 24px;">${data.startVillage} to Pandharpur (${data.startDate} to ${data.endDate})</p>`;
    html += `<div style="display: flex; flex-direction: column; gap: 12px;">`;
    
    let bounds = L.latLngBounds();
    
    data.dayCoords.forEach((day, index) => {
        html += `
            <div style="padding: 12px; border-left: 4px solid var(--marigold); background: var(--paper);">
                <div style="font-weight: 600; margin-bottom: 4px;">Day ${index + 1}</div>
                <div style="font-size: 14px;">${day.start.name} &rarr; ${day.end.name}</div>
                <div style="font-size: 12px; color: var(--ink); margin-top: 4px; opacity: 0.8;">via ${day.viaName}</div>
            </div>
        `;
        if (day.start) bounds.extend([day.start.lat, day.start.lng]);
        if (day.end) bounds.extend([day.end.lat, day.end.lng]);
        
        // Silently fetch and draw the saved route on the map
        setTimeout(async () => {
            const viaCustom = day.customViaCoords || null;
            // Temporarily set dayCoords globally so confirmDayRoute can read it
            dayCoords = data.dayCoords; 
            await window.confirmDayRoute(index, true, viaCustom);
        }, index * 300);
    });
    
    html += `</div>`;
    
    const safeData = JSON.stringify(data).replace(/'/g, "\\'").replace(/"/g, "&quot;");
    html += `<button class="btn-primary" style="margin-top: 24px; background: var(--vermilion); width: 100%;" onclick="window.editDindiRoute(${safeData})">Edit Route Plan</button>`;
    html += `</div>`;
    
    viewContainer.innerHTML = html;
    
    if (map && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] });
    }
};

window.editDindiRoute = function(data) {
    document.getElementById('savedRouteView').style.display = 'none';
    document.getElementById('dindiPlannerSetup').style.display = 'block';
    
    document.getElementById('startDate').value = data.startDate;
    document.getElementById('endDate').value = data.endDate;
    document.getElementById('startVillageInput').value = data.startVillage;
    
    startCoords = data.startCoords;
    dayCoords = data.dayCoords;
    
    // Reset submit button state
    const submitBtn = document.getElementById('submitRouteBtn');
    if (submitBtn) {
        submitBtn.innerText = "Submit Route to Database";
        submitBtn.disabled = false;
        submitBtn.style.background = "#43A047";
    }
    
    window.generateRouteForm(true); // isEditMode = true
};

let startCoords = null;
let searchTimeout = null;

window.searchStartLocation = async function(query) {
    const dropdown = document.getElementById('startVillageDropdown');
    if (!dropdown) return;

    if (!query || query.length < 3) {
        dropdown.classList.remove('active');
        dropdown.innerHTML = '';
        return;
    }

    // Debounce to avoid spamming Nominatim
    if (searchTimeout) clearTimeout(searchTimeout);
    
    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&bbox=72.5,15.5,81.0,22.1`);
            const data = await res.json();
            
            if (!data.features || data.features.length === 0) {
                dropdown.innerHTML = '<div class="autocomplete-item"><span class="village-name">No results found</span></div>';
                dropdown.classList.add('active');
                return;
            }

            dropdown.innerHTML = '';
            
            data.features.forEach(feature => {
                const props = feature.properties;
                const coordsArray = feature.geometry.coordinates; // [lon, lat]
                
                const village = props.name || "Unknown";
                const district = [props.county, props.state].filter(Boolean).join(', ');

                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.innerHTML = `
                    <span class="village-name">${village}</span>
                    <span class="district-name">${district}</span>
                `;
                
                div.onclick = () => {
                    document.getElementById('startVillageInput').value = village;
                    startCoords = { lat: coordsArray[1], lng: coordsArray[0] };
                    dropdown.classList.remove('active');
                    
                    if (map) {
                        map.setView([startCoords.lat, startCoords.lng], 12);
                    }
                };
                
                dropdown.appendChild(div);
            });
            
            dropdown.classList.add('active');
        } catch (error) {
            console.error("Photon Search Error:", error);
        }
    }, 500); // 500ms debounce
};

let dayCoords = [];

window.insertDay = function(index) {
    const prevDay = dayCoords[index - 1];
    let newStart = null;
    if (prevDay && prevDay.end) {
        newStart = { ...prevDay.end };
    }
    
    if (dayCoords[index]) {
        dayCoords[index].start = null;
    }
    
    dayCoords.splice(index, 0, { start: newStart, end: null });
    
    const endDateInput = document.getElementById('endDate');
    const endDate = new Date(endDateInput.value);
    endDate.setDate(endDate.getDate() + 1);
    
    const yyyy = endDate.getFullYear();
    const mm = String(endDate.getMonth() + 1).padStart(2, '0');
    const dd = String(endDate.getDate()).padStart(2, '0');
    endDateInput.value = `${yyyy}-${mm}-${dd}`;
    
    window.generateRouteForm(true);
};

window.removeDay = function(index) {
    if (dayCoords.length <= 1) {
        alert("You cannot remove the only day in the route.");
        return;
    }
    
    if (index > 0 && index < dayCoords.length - 1) {
        dayCoords[index + 1].start = dayCoords[index - 1].end ? { ...dayCoords[index - 1].end } : null;
    } else if (index === 0 && dayCoords.length > 1) {
        dayCoords[1].start = { lat: startCoords.lat, lng: startCoords.lng, name: document.getElementById('startVillageInput').value };
    }
    
    dayCoords.splice(index, 1);
    
    const endDateInput = document.getElementById('endDate');
    const endDate = new Date(endDateInput.value);
    endDate.setDate(endDate.getDate() - 1);
    
    const yyyy = endDate.getFullYear();
    const mm = String(endDate.getMonth() + 1).padStart(2, '0');
    const dd = String(endDate.getDate()).padStart(2, '0');
    endDateInput.value = `${yyyy}-${mm}-${dd}`;
    
    window.generateRouteForm(true);
};

window.generateRouteForm = function(isEditMode = false) {
    const startInput = document.getElementById('startDate').value;
    const endInput = document.getElementById('endDate').value;
    const startVillage = document.getElementById('startVillageInput').value;

    if (!startInput || !endInput) {
        alert("Please select both Start Date and End Date.");
        return;
    }
    if (!startCoords || !startVillage) {
        alert("Please search and select a Starting Village first.");
        return;
    }

    const startDate = new Date(startInput);
    const endDate = new Date(endInput);
    
    if (endDate < startDate) {
        alert("End Date must be after Start Date.");
        return;
    }

    const days = Math.ceil((endDate - startDate) / 86400000) + 1;
    
    // Clear old polylines from the map
    if (dayPolylines) {
        for (const key in dayPolylines) {
            if (map && dayPolylines[key]) {
                map.removeLayer(dayPolylines[key]);
            }
        }
    }
    dayPolylines = {};
    
    // Initialize dayCoords
    if (isEditMode !== true) {
        dayCoords = Array(days).fill(null).map(() => ({ start: null, end: null }));
        dayCoords[0].start = { lat: startCoords.lat, lng: startCoords.lng, name: startVillage };
        dayCoords[days - 1].end = { lat: PANDHARPUR.lat, lng: PANDHARPUR.lng, name: 'Pandharpur' };
    }

    const container = document.getElementById('routePlanContainer');
    container.innerHTML = `<h4 style="margin-bottom: 16px; font-size: 18px;">Route Plan (${days} Days)</h4>`;

    let html = '';
    for (let i = 0; i < days; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = currentDate.toLocaleDateString();

        const isFirstDay = (i === 0);
        const isLastDay = (i === days - 1);

        // Start input
        let startVal = '';
        if (dayCoords[i] && dayCoords[i].start) {
            startVal = dayCoords[i].start.name;
        } else {
            startVal = isFirstDay ? startVillage : 'Auto-filled from previous day';
        }
        
        // End input
        let endVal = '';
        if (dayCoords[i] && dayCoords[i].end) {
            endVal = dayCoords[i].end.name;
        } else {
            endVal = isLastDay ? 'Pandharpur' : '';
        }
        let endReadonly = isLastDay ? 'readonly' : '';
        let endBg = isLastDay ? 'background: #e9e9e9;' : '';
        
        let trashIcon = '';
        if (days > 1) {
            trashIcon = `<button onclick="window.removeDay(${i})" style="position: absolute; top: 12px; right: 12px; background: none; border: none; color: var(--vermilion); cursor: pointer; font-size: 18px;" title="Remove Day">🗑️</button>`;
        }

        const borderColors = ['#F2A93B', '#C1432B', '#5C7A5E', '#1B2340', '#D6871A', '#8A7D63'];
        const dayColor = borderColors[i % borderColors.length];

        html += `
            <div class="card" style="margin-bottom: 24px; padding: 16px; background: var(--paper-2); overflow: visible; position: relative; border-left: 4px solid ${dayColor};">
                ${trashIcon}
                <div style="font-weight: 600; margin-bottom: 12px; color: var(--marigold-deep);">Day ${i + 1} - ${dateStr}</div>
                <div style="display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap;">
                    
                    <div style="flex: 1; min-width: 200px;">
                        <label style="display:block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Start Location</label>
                        <input type="text" id="startStopInput_${i}" class="input-field" value="${startVal}" readonly style="background: #e9e9e9;">
                    </div>

                    <div style="flex: 1; min-width: 200px; position: relative;">
                        <label style="display:block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Via Route</label>
                        <select id="viaSelect_${i}" class="input-field" disabled>
                            <option>(Select End Stop First)</option>
                        </select>
                        <div id="customViaContainer_${i}" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 10; margin-top: 4px;">
                            <input type="text" id="customViaInput_${i}" class="input-field" placeholder="Search Custom Via..." style="border: 1px solid var(--marigold);">
                            <div id="customViaResults_${i}" class="autocomplete-results"></div>
                        </div>
                    </div>

                    <div style="flex: 1; min-width: 200px; position: relative; z-index: ${100 - i};">
                        <label style="display:block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">End Stop</label>
                        <input type="text" id="endStopInput_${i}" class="input-field" placeholder="Search End Stop..." value="${endVal}" ${endReadonly} oninput="window.searchEndLocation(this.value, ${i})" style="${endBg}">
                        <div id="endStopDropdown_${i}" class="autocomplete-results"></div>
                    </div>
                </div>
            </div>
        `;
        
        // Add + button between days
        if (i < days - 1) {
            html += `<div style="text-align: center; margin: -36px 0 12px 0; position: relative; z-index: 10;">
                        <button onclick="window.insertDay(${i + 1})" style="border-radius: 50%; width: 28px; height: 28px; background: var(--marigold); color: white; border: 2px solid white; font-weight: bold; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);" title="Add Stop Here">+</button>
                     </div>`;
        }
    }
    
    container.innerHTML += html;
    document.getElementById('submitRouteBtn').style.display = 'block';
    
    // Auto-fetch cached routes in Edit Mode
    if (isEditMode) {
        for (let i = 0; i < days; i++) {
            if (dayCoords[i] && dayCoords[i].start && dayCoords[i].end) {
                // Fetch each route with a small delay so UI doesn't freeze
                setTimeout(async () => {
                    const viaCustom = dayCoords[i].customViaCoords || null;
                    await window.confirmDayRoute(i, true, viaCustom);
                    
                    const select = document.getElementById(`viaSelect_${i}`);
                    if (select) {
                        if (dayCoords[i].viaType === 'custom') {
                            select.value = 'custom';
                            document.getElementById(`customViaContainer_${i}`).style.display = 'block';
                            document.getElementById(`customViaInput_${i}`).value = dayCoords[i].viaName;
                        } else if (dayCoords[i].viaType === 'rest') {
                            select.value = 'rest';
                        } else {
                            select.value = dayCoords[i].viaIndex;
                        }
                        // Trigger drawing
                        select.dispatchEvent(new Event('change'));
                    }
                }, i * 300);
            }
        }
    }
};

window.submitDindiRoute = async function() {
    const userId = localStorage.getItem('userId');
    if (!userId) {
        alert("You must be logged in as a Dindi Leader to save a route.");
        return;
    }
    
    const submitBtn = document.getElementById('submitRouteBtn');
    submitBtn.innerText = "Saving...";
    submitBtn.disabled = true;
    
    // Validate that all days have a selected route
    for (let i = 0; i < dayCoords.length; i++) {
        const day = dayCoords[i];
        if (!day.start || !day.end) {
            alert(`Please complete Start and End stops for Day ${i + 1}.`);
            submitBtn.innerText = "Submit Route to Database";
            submitBtn.disabled = false;
            return;
        }
        
        const select = document.getElementById(`viaSelect_${i}`);
        if (!select || select.disabled || select.value === "" || select.value === "(Select End Stop First)") {
            alert(`Please select a Via Route for Day ${i + 1}.`);
            submitBtn.innerText = "Submit Route to Database";
            submitBtn.disabled = false;
            return;
        }
        
        // Save the chosen via data
        if (select.value === 'custom') {
            const customInput = document.getElementById(`customViaInput_${i}`).value;
            if (!customInput) {
                alert(`Please enter a custom via for Day ${i + 1}.`);
                submitBtn.innerText = "Submit Route to Database";
                submitBtn.disabled = false;
                return;
            }
            day.viaType = 'custom';
            day.viaName = customInput;
            day.viaIndex = -1;
        } else if (select.value === 'rest') {
            day.viaType = 'rest';
            day.viaName = 'Rest Day (0 km)';
            day.viaIndex = -1;
        } else {
            day.viaType = 'ors';
            const selectedOpt = select.options[select.selectedIndex];
            day.viaName = selectedOpt ? selectedOpt.innerText : 'Main Route';
            day.viaIndex = parseInt(select.value, 10);
        }
    }
    
    try {
        const payload = {
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value,
            startVillage: document.getElementById('startVillageInput').value,
            startCoords: startCoords,
            dayCoords: dayCoords,
            updatedAt: new Date().toISOString()
        };
        
        await setDoc(doc(db, 'dindiRoutes', userId), payload);
        
        submitBtn.innerText = "Successfully Saved!";
        submitBtn.style.background = "#43A047";
        
        setTimeout(() => {
            window.loadSavedRoute(payload);
        }, 1000);
        
    } catch (error) {
        console.error("Error saving route:", error);
        alert("Failed to save route. Please try again.");
        submitBtn.innerText = "Submit Route to Database";
        submitBtn.disabled = false;
    }
};

// Smart Via-Naming Brain
async function getViaName(coordinates, startName, endName) {
    if (!coordinates || coordinates.length < 10) return "Direct Route";
    
    // Middle-out sampling: 50%, 60%, 40%, 70%, 30%, 80%, 20%
    const fractions = [0.5, 0.6, 0.4, 0.7, 0.3, 0.8, 0.2];
    
    for (let i = 0; i < fractions.length; i++) {
        const idx = Math.floor(coordinates.length * fractions[i]);
        const [lng, lat] = coordinates[idx];
        
        try {
            const res = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&radius=3`);
            const data = await res.json();
            
            if (data.features && data.features.length > 0) {
                // Find first valid settlement
                for (const feature of data.features) {
                    const placeType = feature.properties.osm_value;
                    const name = feature.properties.name;
                    
                    if (['village', 'town', 'city', 'hamlet'].includes(placeType)) {
                        if (name && !startName.includes(name) && !endName.includes(name) && !name.includes(startName) && !name.includes(endName)) {
                            return name; // Found a valid via name
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Photon Reverse Geocoding failed for point", idx);
        }
        
        // Wait 200ms to respect rate limit
        await new Promise(r => setTimeout(r, 200));
    }
    return "Alternative Route";
}

let dayPolylines = {};
const routeColors = ['#E53935', '#1E88E5', '#43A047', '#FF8F00', '#8E24AA', '#00ACC1', '#D81B60'];

window.confirmDayRoute = async function(dayIndex, isSilent = false, customViaCoords = null) {
    const dayData = dayCoords[dayIndex];
    if (!dayData.start || !dayData.end) {
        if (!isSilent) alert("Please ensure both Start and End locations are selected for this day.");
        return;
    }

    const { start, end } = dayData;
    
    if (customViaCoords) {
        dayData.customViaCoords = customViaCoords;
    }
    
    // Create cache ID (rounded to 4 decimals, with underscores)
    const startLatRound = start.lat.toFixed(4).replace('.', '_');
    const startLngRound = start.lng.toFixed(4).replace('.', '_');
    const endLatRound = end.lat.toFixed(4).replace('.', '_');
    const endLngRound = end.lng.toFixed(4).replace('.', '_');
    
    let cacheId = `${startLatRound}_${startLngRound}-${endLatRound}_${endLngRound}`;
    if (customViaCoords) {
        const cLat = customViaCoords.lat.toFixed(4).replace('.', '_');
        const cLng = customViaCoords.lng.toFixed(4).replace('.', '_');
        cacheId = `${startLatRound}_${startLngRound}-${cLat}_${cLng}-${endLatRound}_${endLngRound}`;
    }
    
    // 4. Rest Day Bypassing
    if (startLatRound === endLatRound && startLngRound === endLngRound) {
        console.log("Rest Day Detected. Bypassing ORS...");
        const select = document.getElementById(`viaSelect_${dayIndex}`);
        if (select) {
            select.innerHTML = '<option value="rest">Rest Day (0 km)</option>';
            select.disabled = false;
        }

        if (dayPolylines[dayIndex]) {
            map.removeLayer(dayPolylines[dayIndex]);
        }
        
        const marker = L.marker([start.lat, start.lng]).addTo(map);
        marker.bindTooltip(`Day ${dayIndex + 1}: Rest Day at ${start.name}`, { permanent: true, direction: 'top' });
        dayPolylines[dayIndex] = marker; // Store as layer
        
        if (map) {
            map.setView([start.lat, start.lng], 14);
        }
        return;
    }
    
    let routes = [];
    
    try {
        if (!isSilent) {
            const select = document.getElementById(`viaSelect_${dayIndex}`);
            if (select) select.innerHTML = '<option>Loading routes...</option>';
        }

        // 1. Cache First
        const cacheRef = doc(db, 'globalRoutesCache', cacheId);
        const cacheSnap = await getDoc(cacheRef);
        
        if (cacheSnap.exists()) {
            console.log("Cache Hit for Route:", cacheId);
            const d = cacheSnap.data();
            routes = d.routesData ? JSON.parse(d.routesData) : d.routes;
        } else {
            console.log("Cache Miss. Fetching from ORS API...");
            // 2. API Second
            const coordinates = customViaCoords 
                ? [[start.lng, start.lat], [customViaCoords.lng, customViaCoords.lat], [end.lng, end.lat]]
                : [[start.lng, start.lat], [end.lng, end.lat]];
                
            const body = {
                coordinates: coordinates,
                radiuses: customViaCoords ? [-1, -1, -1] : [-1, -1],
                alternative_routes: customViaCoords ? undefined : { target_count: 3 }
            };
            
            let orsRes = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': ORS_API_KEY
                },
                body: JSON.stringify(body)
            });
            
            if (!orsRes.ok) {
                const errJson = await orsRes.json();
                if (errJson.error && errJson.error.code === 2004) {
                    console.warn("Distance too long for alternative routes. Retrying with single route...");
                    delete body.alternative_routes;
                    orsRes = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': ORS_API_KEY
                        },
                        body: JSON.stringify(body)
                    });
                    if (!orsRes.ok) {
                        throw new Error("ORS API Error: " + await orsRes.text());
                    }
                } else {
                    throw new Error("ORS API Error: " + JSON.stringify(errJson));
                }
            }
            
            const geojson = await orsRes.json();
            
            if (!geojson.features || geojson.features.length === 0) {
                throw new Error("No routes found.");
            }
            
            routes = [];
            for (let i = 0; i < geojson.features.length; i++) {
                const feature = geojson.features[i];
                const coords = feature.geometry.coordinates; // Array of [lng, lat]
                
                // 3. Smart Via-Naming Brain
                let routeName = "Main Route";
                if (customViaCoords) {
                    routeName = "Custom Route";
                } else {
                    const viaName = await getViaName(coords, start.name, end.name);
                    if (viaName !== "Alternative Route" && viaName !== "Direct Route") {
                        routeName = i === 0 ? `Main Route (via ${viaName})` : `Via ${viaName}`;
                    } else {
                        routeName = i === 0 ? "Main Route" : "Alternative Route";
                    }
                }
                
                // 4. Cache Save (Prune GeoJSON)
                // We keep only the geometry coordinates and essential props to compress it heavily
                routes.push({
                    name: routeName,
                    geometry: {
                        type: "LineString",
                        coordinates: coords
                    },
                    properties: {
                        distance: feature.properties.summary.distance,
                        duration: feature.properties.summary.duration
                    }
                });
            }
            
            // Save to Firestore (stringify to bypass nested array limits)
            await setDoc(cacheRef, { routesData: JSON.stringify(routes) });
            console.log("Saved routes to cache:", cacheId);
        }
        
        // 5. Populate Dropdown and Draw Map
        const select = document.getElementById(`viaSelect_${dayIndex}`);
        if (select) {
            select.innerHTML = '';
            select.disabled = false;
            
            routes.forEach((rt, idx) => {
                const km = (rt.properties.distance / 1000).toFixed(1);
                const opt = document.createElement('option');
                opt.value = idx;
                opt.innerText = `${rt.name} (${km} km)`;
                select.appendChild(opt);
            });
            
            // Add Custom Via option
            const customOpt = document.createElement('option');
            customOpt.value = 'custom';
            customOpt.innerText = `Search Custom Via...`;
            
            // If we are ALREADY displaying a custom via, let's select it and change the name
            if (customViaCoords) {
                customOpt.innerText = `Custom Via Active`;
                customOpt.selected = true;
            }
            select.appendChild(customOpt);
        }
        
        const customContainer = document.getElementById(`customViaContainer_${dayIndex}`);
        
        // Map Drawing function
        const drawRouteOnMap = (routeIdx) => {
            const route = routes[routeIdx];
            if (!route) return;
            
            // Remove previous polyline for this day if it exists
            if (dayPolylines[dayIndex]) {
                map.removeLayer(dayPolylines[dayIndex]);
            }
            
            // Convert [lng, lat] to [lat, lng] for Leaflet
            const latlngs = route.geometry.coordinates.map(c => [c[1], c[0]]);
            const color = routeColors[dayIndex % routeColors.length];
            
            const polyline = L.polyline(latlngs, {
                color: color,
                weight: 5,
                opacity: 0.8
            }).addTo(map);
            
            // Add a tooltip or popup to the line
            polyline.bindTooltip(`Day ${dayIndex + 1}: ${route.name}`, { sticky: true });
            
            dayPolylines[dayIndex] = polyline;
            
            // Auto fit bounds to show the new route
            map.fitBounds(polyline.getBounds(), { padding: [20, 20] });
        };
        
        // Draw the correct route (either saved index, or 0)
        if (map && routes.length > 0) {
            let idxToDraw = 0;
            if (dayData.viaIndex !== undefined && dayData.viaIndex > -1) {
                idxToDraw = dayData.viaIndex;
            }
            drawRouteOnMap(idxToDraw);
        }
        
        // On selection change, redraw
        if (select) {
            select.onchange = (e) => {
                const val = e.target.value;
                if (val === 'custom') {
                    customContainer.style.display = 'block';
                    window.setupCustomViaSearch(dayIndex);
                } else {
                    customContainer.style.display = 'none';
                    drawRouteOnMap(parseInt(val, 10));
                }
            };
        }
        
    } catch (error) {
        console.error("Error fetching route:", error);
        if (!isSilent) {
            document.getElementById(`viaSelect_${dayIndex}`).innerHTML = '<option>Error Fetching Route</option>';
            alert("Error fetching route. Please ensure ORS API key is configured correctly.");
        }
    }
};

let endSearchTimeout = null;

window.searchEndLocation = async function(query, dayIndex) {
    const dropdown = document.getElementById(`endStopDropdown_${dayIndex}`);
    if (!dropdown) return;

    if (!query) {
        // Clear this day's end coords
        dayCoords[dayIndex].end = null;
        // Clear next day's start input and coords (if not the last day)
        if (dayIndex + 1 < dayCoords.length) {
            dayCoords[dayIndex + 1].start = null;
            const nextStartInput = document.getElementById(`startStopInput_${dayIndex + 1}`);
            if (nextStartInput) nextStartInput.value = '';
        }
    }

    if (!query || query.length < 3) {
        dropdown.classList.remove('active');
        dropdown.innerHTML = '';
        return;
    }

    if (endSearchTimeout) clearTimeout(endSearchTimeout);
    
    endSearchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&bbox=72.5,15.5,81.0,22.1`);
            const data = await res.json();
            
            if (!data.features || data.features.length === 0) {
                dropdown.innerHTML = '<div class="autocomplete-item"><span class="village-name">No results found</span></div>';
                dropdown.classList.add('active');
                return;
            }

            dropdown.innerHTML = '';
            
            data.features.forEach(feature => {
                const props = feature.properties;
                const coordsArray = feature.geometry.coordinates; // [lon, lat]
                
                const village = props.name || "Unknown";
                const district = [props.county, props.state].filter(Boolean).join(', ');

                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.innerHTML = `
                    <span class="village-name">${village}</span>
                    <span class="district-name">${district}</span>
                `;
                
                div.onclick = () => {
                    // Set input value
                    document.getElementById(`endStopInput_${dayIndex}`).value = village;
                    // Store coords
                    const coords = { lat: coordsArray[1], lng: coordsArray[0], name: village };
                    dayCoords[dayIndex].end = coords;
                    dropdown.classList.remove('active');
                    
                    // Fetch route for THIS day
                    if (window.confirmDayRoute) {
                        window.confirmDayRoute(dayIndex);
                    }
                    
                    // Auto-fill next day's start (if it exists)
                    if (dayIndex + 1 < dayCoords.length) {
                        dayCoords[dayIndex + 1].start = coords;
                        const nextStartInput = document.getElementById(`startStopInput_${dayIndex + 1}`);
                        if (nextStartInput) {
                            nextStartInput.value = village;
                        }
                        
                        // If next day has BOTH start and end, we can fetch its route automatically
                        if (dayCoords[dayIndex + 1].start && dayCoords[dayIndex + 1].end) {
                            if (window.confirmDayRoute) {
                                window.confirmDayRoute(dayIndex + 1, true);
                            }
                        }
                    }

                    // Pan map
                    if (map) {
                        map.setView([coords.lat, coords.lng], 12);
                    }
                };
                
                dropdown.appendChild(div);
            });
            
            dropdown.classList.add('active');
        } catch (error) {
            console.error("Photon Search Error:", error);
        }
    }, 500); // 500ms debounce
};

window.setupCustomViaSearch = function(dayIndex) {
    const input = document.getElementById(`customViaInput_${dayIndex}`);
    const results = document.getElementById(`customViaResults_${dayIndex}`);
    
    input.oninput = null;
    let timeout = null;
    
    input.oninput = (e) => {
        const query = e.target.value;
        if (query.length < 3) {
            results.classList.remove('active');
            return;
        }
        
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            try {
                const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&bbox=72.5,15.5,81.0,22.1`);
                const data = await res.json();
                
                if (!data.features || data.features.length === 0) {
                    results.innerHTML = '<div class="autocomplete-item">No results found</div>';
                    results.classList.add('active');
                    return;
                }

                results.innerHTML = '';
                data.features.forEach(feature => {
                    const props = feature.properties;
                    const coordsArray = feature.geometry.coordinates; // [lon, lat]
                    
                    const village = props.name || "Unknown";
                    const district = [props.county, props.state].filter(Boolean).join(', ');

                    const div = document.createElement('div');
                    div.className = 'autocomplete-item';
                    div.innerHTML = `<span class="village-name">${village}</span><span class="district-name">${district}</span>`;
                    
                    div.onclick = () => {
                        input.value = village;
                        results.classList.remove('active');
                        // Trigger custom routing!
                        const coords = { lat: coordsArray[1], lng: coordsArray[0], name: village };
                        window.confirmDayRoute(dayIndex, false, coords);
                    };
                    results.appendChild(div);
                });
                results.classList.add('active');
            } catch (err) {
                console.error("Custom Via Search Error:", err);
            }
        }, 500);
    };
};
