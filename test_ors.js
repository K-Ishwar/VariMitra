// native fetch is available in Node 24

async function testORS() {
    const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjFjYzk1ZTJiOTM3YTQzMjk4MDc4ZmRjOThjNzlhMjVjIiwiaCI6Im11cm11cjY0In0=';
    
    const body = {
        coordinates: [[73.8567, 18.5204], [75.3266, 17.6799]],
        radiuses: [-1, -1],
        alternative_routes: { target_count: 3 }
    };
    
    try {
        const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': ORS_API_KEY
            },
            body: JSON.stringify(body)
        });
        
        if (!res.ok) {
            const errText = await res.text();
            console.error("ORS API Error:", errText);
        } else {
            console.log("Success!");
        }
    } catch (e) {
        console.error(e);
    }
}

testORS();
