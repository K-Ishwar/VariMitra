import { db } from '../config.js';
import { collection, query, where, getDocs, updateDoc, doc, onSnapshot, addDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export async function initSuperAdmin() {
    console.log("Super Admin module initialized.");
    
    // Animate counters
    function animateCounter(id, target) {
        const el = document.getElementById(id);
        if (!el) return;
        let start = 0;
        const duration = 1500;
        const stepTime = Math.abs(Math.floor(duration / (target || 1)));
        
        const timer = setInterval(() => {
            if (start >= target) {
                el.innerText = target;
                clearInterval(timer);
                return;
            }
            start += Math.max(1, Math.floor(target / 50));
            if(start > target) start = target;
            el.innerText = start;
        }, stepTime);
    }

    // Fetch stats
    try {
        const usersRef = collection(db, 'users');
        
        // Count Dindis
        const dindiQ = query(usersRef, where('role', '==', 'dindi_leader'));
        const dindiSnap = await getDocs(dindiQ);
        const dindiCount = dindiSnap.size;
        
        let pilgrimCount = 0;
        dindiSnap.forEach(d => {
            const data = d.data();
            if(data.pilgrimCount) {
                pilgrimCount += parseInt(data.pilgrimCount, 10);
            }
        });
        
        // Count NGOs
        const ngoQ = query(usersRef, where('role', '==', 'ngo'));
        const ngoSnap = await getDocs(ngoQ);
        const ngoCount = ngoSnap.size;

        animateCounter('stat-dindis', dindiCount);
        animateCounter('stat-ngos', ngoCount);
        animateCounter('stat-pilgrims', pilgrimCount);

        // Render Dindi Directory
        const dindiListEl = document.getElementById('dindi-directory-list');
        let dindis = [];
        dindiSnap.forEach(d => {
            dindis.push({ id: d.id, ...d.data() });
        });

        window.renderDindis = function(filter = "") {
            if (!dindiListEl) return;
            dindiListEl.innerHTML = "";
            const filtered = dindis.filter(d => 
                (d.name || "").toLowerCase().includes(filter.toLowerCase()) || 
                (d.villageName || "").toLowerCase().includes(filter.toLowerCase())
            );
            
            if(filtered.length === 0) {
                dindiListEl.innerHTML = '<p style="color:gray;">No matching Dindis found.</p>';
                return;
            }

            filtered.forEach(d => {
                const hasRoute = d.routePlan ? 'green' : 'grey';
                const div = document.createElement('div');
                div.className = 'list-row';
                div.style.cursor = 'pointer';
                div.onclick = () => window.openDrawer(d);
                div.innerHTML = `
                    <div class="list-row-content">
                        <div style="font-weight:600; margin-bottom:4px;">
                            <span class="status-dot ${hasRoute}"></span> ${d.name}
                        </div>
                        <div style="font-size:12px; color:var(--sage);">
                            ${d.villageName || 'Unknown Village'} | ${d.pilgrimCount || 0} Pilgrims
                        </div>
                    </div>
                `;
                dindiListEl.appendChild(div);
            });
        }
        
        window.renderDindis();
        
        document.getElementById('dindi-search').addEventListener('input', (e) => {
            window.renderDindis(e.target.value);
        });

        // Real-time pending NGOs
        const pendingNgoQ = query(usersRef, where('role', '==', 'ngo'), where('status', '==', 'pending'));
        onSnapshot(pendingNgoQ, (snapshot) => {
            const queueEl = document.getElementById('ngo-queue-list');
            if (!queueEl) return;
            queueEl.innerHTML = "";
            if(snapshot.empty) {
                queueEl.innerHTML = '<p style="color:gray; padding:16px;">No pending NGOs in the queue.</p>';
                return;
            }

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const div = document.createElement('div');
                div.className = 'list-row';
                div.id = `ngo-row-${docSnap.id}`;
                div.innerHTML = `
                    <div class="list-row-content">
                        <div style="font-weight:600;">${data.ngoName || data.name}</div>
                        <div style="font-size:12px; color:var(--sage);">Reg No: ${data.ngoRegNo || 'N/A'} | ${data.location || 'Unknown Location'} | ${data.ngoType || 'Type N/A'}</div>
                    </div>
                    <div class="list-row-actions">
                        <button class="btn-approve" onclick="window.updateNgoStatus('${docSnap.id}', 'approved')">✅ Approve</button>
                        <button class="btn-reject" onclick="window.updateNgoStatus('${docSnap.id}', 'rejected')">❌ Reject</button>
                    </div>
                `;
                queueEl.appendChild(div);
            });
        });

        // Call the User Management fetch
        if (window.fetchAndRenderAllUsers) {
            window.fetchAndRenderAllUsers();
        }

    } catch(e) {
        console.error("Error loading Super Admin stats:", e);
    }
};

window.updateNgoStatus = async function(docId, newStatus) {
    const row = document.getElementById(`ngo-row-${docId}`);
    if(row) {
        row.classList.add('slide-out');
    }
    
    setTimeout(async () => {
        try {
            await updateDoc(doc(db, 'users', docId), { status: newStatus });
        } catch(e) {
            console.error("Error updating NGO status:", e);
            if(row) row.classList.remove('slide-out'); // Revert if error
        }
    }, 300); // match transition duration
};

window.openDrawer = function(data) {
    const drawer = document.getElementById('profile-drawer');
    const content = document.getElementById('drawer-content');
    const title = document.getElementById('drawer-title');
    
    if (!drawer) return;
    
    title.innerText = data.name;
    
    let html = `<div style="margin-bottom:16px;"><strong>Role:</strong> ${data.role}</div>`;
    html += `<div style="margin-bottom:16px;"><strong>Phone:</strong> ${data.phone || data.username}</div>`;
    
    if(data.role === 'dindi_leader') {
        html += `<div style="margin-bottom:16px;"><strong>Dindi Name:</strong> ${data.dindiName || '-'}</div>`;
        html += `<div style="margin-bottom:16px;"><strong>Village:</strong> ${data.villageName || '-'}</div>`;
        html += `<div style="margin-bottom:16px;"><strong>Pilgrim Count:</strong> ${data.pilgrimCount || '-'}</div>`;
        html += `<div style="margin-bottom:16px;"><strong>Status:</strong> ${data.status}</div>`;
        if(data.routePlan) {
            html += `<div style="margin-top:24px; font-weight:600; border-bottom:1px solid var(--line); padding-bottom:8px;">Route Plan</div>`;
            html += `<pre style="font-size:12px; background:var(--paper-2); padding:8px; border-radius:4px; overflow-x:auto;">${JSON.stringify(data.routePlan, null, 2)}</pre>`;
        } else {
            html += `<div style="margin-top:24px; font-weight:600; color:gray;">No Route Plan Submitted</div>`;
        }
    }
    
    content.innerHTML = html;
    drawer.classList.add('open');
};

window.closeDrawer = function() {
    const drawer = document.getElementById('profile-drawer');
    if (drawer) drawer.classList.remove('open');
};

window.createAuthority = async function(event) {
    event.preventDefault();
    const type = document.getElementById('auth-type').value;
    const name = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;
    const btn = event.target.querySelector('button');
    
    btn.innerText = "Creating...";
    btn.disabled = true;

    try {
        const newUser = {
            role: 'authority',
            authorityType: type,
            name: name,
            username: name,
            password: password,
            status: 'approved',
            createdAt: new Date().toISOString()
        };
        
        await addDoc(collection(db, 'users'), newUser);
        
        if(window.showModal) {
            await window.showModal('Success', `Authority account for ${name} created successfully.`);
        } else {
            alert('Authority account created successfully.');
        }
        
        event.target.reset();
    } catch(e) {
        console.error("Error creating authority account:", e);
        if(window.showModal) {
            window.showModal('Error', 'Failed to create account. Check console.');
        } else {
            alert('Failed to create account.');
        }
    } finally {
        btn.innerText = "Create Account";
        btn.disabled = false;
    }
};

// --- User Management Logic ---
let allUsersData = {
    authority: [],
    dindi_leader: [],
    ngo: [],
    public: []
};

window.fetchAndRenderAllUsers = async function() {
    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        // Reset
        allUsersData = { authority: [], dindi_leader: [], ngo: [], public: [] };
        
        usersSnap.forEach(d => {
            const data = d.data();
            const role = data.role;
            if (allUsersData[role]) {
                allUsersData[role].push({ id: d.id, ...data });
            }
        });
        
        // Render the currently active tab (default to authority if not set)
        const activeTab = window.currentMgmtTab || 'authority';
        window.switchUserTab(activeTab);
        
    } catch(e) {
        console.error("Error fetching all users:", e);
    }
};

window.switchUserTab = function(role) {
    window.currentMgmtTab = role;
    const tabs = ['authority', 'dindi_leader', 'ngo', 'public'];
    
    // Update button styles
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        if(btn) {
            if(t === role) {
                btn.style.backgroundColor = 'var(--night)';
                btn.style.color = 'white';
            } else {
                btn.style.backgroundColor = 'var(--paper-2)';
                btn.style.color = 'var(--ink)';
            }
        }
    });

    // Render list
    const listEl = document.getElementById('user-management-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    const users = allUsersData[role] || [];
    
    if (users.length === 0) {
        listEl.innerHTML = '<p style="color:gray; padding: 16px;">No users found in this category.</p>';
        return;
    }
    
    users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'list-row';
        div.style.alignItems = 'flex-start';
        
        // Basic Info
        let infoHtml = `<div style="font-weight:600; margin-bottom:4px; font-size:16px;">${u.name || 'Unnamed'}</div>`;
        infoHtml += `<div style="font-size:14px; color:var(--ink); margin-bottom:4px;">Username: ${u.username || 'N/A'}</div>`;
        
        // Role specific info
        if (role === 'authority') {
            infoHtml += `<div style="font-size:12px; color:var(--sage);">Type: ${u.authorityType || 'N/A'}</div>`;
        } else if (role === 'dindi_leader') {
            infoHtml += `<div style="font-size:12px; color:var(--sage);">Village: ${u.villageName || 'N/A'} | Phone: ${u.phone || 'N/A'}</div>`;
        } else if (role === 'ngo') {
            infoHtml += `<div style="font-size:12px; color:var(--sage);">Reg No: ${u.ngoRegNo || 'N/A'} | Type: ${u.ngoType || 'N/A'}</div>`;
        } else if (role === 'public') {
            infoHtml += `<div style="font-size:12px; color:var(--sage);">Phone: ${u.phone || 'N/A'}</div>`;
        }
        
        infoHtml += `<div style="font-size:12px; color:gray; margin-top:4px;">Joined: ${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}</div>`;

        div.innerHTML = `
            <div class="list-row-content">
                ${infoHtml}
            </div>
            <div class="list-row-actions" style="align-self: center;">
                <button class="btn-reject" onclick="window.deleteUser('${u.id}', '${u.name?.replace(/'/g, "\\'")}')">🗑️ Remove</button>
            </div>
        `;
        listEl.appendChild(div);
    });
};

window.deleteUser = async function(docId, name) {
    if (window.showConfirmModal) {
        await window.showConfirmModal(
            'Confirm Permanent Deletion',
            `Are you sure you want to permanently delete user "${name}"? This action cannot be undone.`
        );
        // If modal resolves, proceed. If cancelled, it throws an error which we ignore.
    } else {
        if (!confirm(`Are you sure you want to permanently delete user "${name}"?`)) return;
    }
    
    try {
        await deleteDoc(doc(db, 'users', docId));
        console.log(`User ${docId} deleted successfully.`);
        // Refresh the list
        await window.fetchAndRenderAllUsers();
    } catch(e) {
        console.error("Error deleting user:", e);
        alert("Failed to delete user. Check console.");
    }
};
