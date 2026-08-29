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
        html: '<div style="font-size: 24px; background: white; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3); border: 2px solid var(--marigold-deep);">🛕</div>',
        className: 'custom-temple-icon',
        iconSize: [36, 36],
        iconAnchor: [18, 18] // Center of the icon
    });

    // Add marker at Pandharpur
    L.marker([PANDHARPUR.lat, PANDHARPUR.lng], { icon: templeIcon })
        .addTo(map)
        .bindPopup('<b>Pandharpur</b><br>Final Destination')
        .openPopup();
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
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}+Maharashtra&format=json&limit=5&countrycodes=in`);
            const data = await res.json();
            
            if (data.length === 0) {
                dropdown.innerHTML = '<div class="autocomplete-item"><span class="village-name">No results found</span></div>';
                dropdown.classList.add('active');
                return;
            }

            dropdown.innerHTML = '';
            
            data.forEach(item => {
                // Split display name to get village and district/state
                const parts = item.display_name.split(',').map(p => p.trim());
                const village = parts[0];
                const district = parts.slice(1).join(', ');

                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.innerHTML = `
                    <span class="village-name">${village}</span>
                    <span class="district-name">${district}</span>
                `;
                
                div.onclick = () => {
                    document.getElementById('startVillageInput').value = village;
                    startCoords = { lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
                    dropdown.classList.remove('active');
                    
                    if (map) {
                        map.setView([startCoords.lat, startCoords.lng], 12);
                        // Optional: Add a marker for the start point
                        // L.marker([startCoords.lat, startCoords.lng]).addTo(map).bindPopup('Start: ' + village).openPopup();
                    }
                };
                
                dropdown.appendChild(div);
            });
            
            dropdown.classList.add('active');
        } catch (error) {
            console.error("Nominatim Search Error:", error);
        }
    }, 500); // 500ms debounce
};

let dayCoords = [];

window.generateRouteForm = function() {
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
    
    // Initialize dayCoords
    dayCoords = Array(days).fill(null).map(() => ({ start: null, end: null }));
    dayCoords[0].start = { lat: startCoords.lat, lng: startCoords.lng, name: startVillage };
    dayCoords[days - 1].end = { lat: PANDHARPUR.lat, lng: PANDHARPUR.lng, name: 'Pandharpur' };

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
        let startVal = isFirstDay ? startVillage : 'Auto-filled from previous day';
        
        // End input
        let endVal = isLastDay ? 'Pandharpur' : '';
        let endReadonly = isLastDay ? 'readonly' : '';
        let endBg = isLastDay ? 'background: #e9e9e9;' : '';

        html += `
            <div class="card" style="margin-bottom: 16px; padding: 16px; background: var(--paper-2); overflow: visible;">
                <div style="font-weight: 600; margin-bottom: 12px; color: var(--marigold-deep);">Day ${i + 1} - ${dateStr}</div>
                <div style="display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap;">
                    
                    <div style="flex: 1; min-width: 200px;">
                        <label style="display:block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Start Location</label>
                        <input type="text" id="startStopInput_${i}" class="input-field" value="${startVal}" readonly style="background: #e9e9e9;">
                    </div>

                    <div style="flex: 1; min-width: 200px;">
                        <label style="display:block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Via Route</label>
                        <select class="input-field" id="viaSelect_${i}" disabled>
                            <option value="">(Select End Stop First)</option>
                        </select>
                    </div>

                    <div style="flex: 1; min-width: 200px; position: relative; z-index: ${100 - i};">
                        <label style="display:block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">End Stop</label>
                        <input type="text" id="endStopInput_${i}" class="input-field" placeholder="Search End Stop..." value="${endVal}" ${endReadonly} oninput="window.searchEndLocation(this.value, ${i})" style="${endBg}">
                        <div id="endStopDropdown_${i}" class="autocomplete-results"></div>
                    </div>
                </div>
            </div>
        `;
    }
    
    container.innerHTML += html;
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
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}+Maharashtra&format=json&limit=5&countrycodes=in`);
            const data = await res.json();
            
            if (data.length === 0) {
                dropdown.innerHTML = '<div class="autocomplete-item"><span class="village-name">No results found</span></div>';
                dropdown.classList.add('active');
                return;
            }

            dropdown.innerHTML = '';
            
            data.forEach(item => {
                const parts = item.display_name.split(',').map(p => p.trim());
                const village = parts[0];
                const district = parts.slice(1).join(', ');

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
                    const coords = { lat: parseFloat(item.lat), lng: parseFloat(item.lon), name: village };
                    dayCoords[dayIndex].end = coords;
                    dropdown.classList.remove('active');
                    
                    // Auto-fill next day's start (if it exists)
                    if (dayIndex + 1 < dayCoords.length) {
                        dayCoords[dayIndex + 1].start = coords;
                        const nextStartInput = document.getElementById(`startStopInput_${dayIndex + 1}`);
                        if (nextStartInput) {
                            nextStartInput.value = village;
                        }
                        
                        // If next day is the LAST day, fetch route for last leg silently
                        if (dayIndex + 1 === dayCoords.length - 1) {
                            if (window.fetchRouteForDay) {
                                window.fetchRouteForDay(dayIndex + 1);
                            } else {
                                console.log("TODO: silently auto-fetch the route for the last leg (Pandharpur)");
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
            console.error("Nominatim Search Error:", error);
        }
    }, 500); // 500ms debounce
};
