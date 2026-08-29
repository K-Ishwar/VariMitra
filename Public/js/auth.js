import { db } from './config.js';
import { collection, query, where, getDocs, addDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// --- Loading Overlay Helpers ---
function showLoading() {
    let overlay = document.getElementById('global-loading');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'global-loading';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<span class="spinner"></span>';
        document.body.appendChild(overlay);
    }
    void overlay.offsetWidth;
    overlay.classList.add('active');
}

function hideLoading() {
    const overlay = document.getElementById('global-loading');
    if (overlay) overlay.classList.remove('active');
}

// --- Login Logic ---
window.handleLogin = async function(event) {
    event.preventDefault();
    showLoading();
    
    const usernameInput = document.getElementById('username').value;
    const passwordInput = document.getElementById('loginPass').value;
    
    // Super Admin Bypass
    if (usernameInput === 'SAdmin' && passwordInput === 'SAdmin') {
        localStorage.setItem('userRole', 'super_admin');
        localStorage.setItem('userName', 'Super Admin');
        window.location.href = 'dashboard.html';
        hideLoading();
        return;
    }
    
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', usernameInput), where('password', '==', passwordInput));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            const userData = userDoc.data();
            
            if (userData.status === 'pending') {
                if (window.showModal) {
                    await window.showModal('Account Pending / खाते प्रलंबित', 'Your account is currently awaiting approval from authorities.');
                } else {
                    alert('Your account is currently awaiting approval from authorities.');
                }
                return;
            }
            
            // Save to localStorage
            localStorage.setItem('userId', userDoc.id);
            localStorage.setItem('userRole', userData.role);
            localStorage.setItem('userName', userData.name || userData.username);
            if (userData.phone) {
                localStorage.setItem('userPhone', userData.phone);
            }
            
            // Redirect to SPA dashboard
            window.location.href = 'dashboard.html';
        } else {
            if (window.showModal) {
                await window.showModal('Login Failed / लॉगिन अयशस्वी', 'Invalid username or password.');
            } else {
                alert('Invalid username or password.');
            }
        }
    } catch (error) {
        console.error("Error logging in:", error);
        if (window.showModal) {
            await window.showModal('Error', 'An error occurred during login. Please check console.');
        } else {
            alert('An error occurred during login.');
        }
    } finally {
        hideLoading();
    }
};

// --- Helper for file to base64 ---
const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
};

// --- Registration Logic ---
window.handleRegister = async function(event, role) {
    event.preventDefault();
    showLoading();
    
    try {
        let name, phone, password, status = 'approved', extraData = {};
        
        // 1 & 2: Read fields based on role
        if (role === 'dindi_leader') {
            name = document.getElementById('regName_dindi_leader').value;
            phone = document.getElementById('regPhone_dindi_leader').value;
            password = document.getElementById('regPass_dindi_leader').value;
            
            const photoFile = document.getElementById('leaderPhoto').files[0];
            let photoBase64 = null;
            if (photoFile) {
                photoBase64 = await fileToBase64(photoFile); // Convert to base64 string
            }
            
            extraData = {
                dindiName: document.getElementById('dindiName').value,
                villageName: document.getElementById('villageName').value,
                pilgrimCount: parseInt(document.getElementById('pilgrimCount').value, 10),
                leaderPhoto: photoBase64
            };
            status = 'approved';
            
        } else if (role === 'ngo') {
            name = document.getElementById('regName_ngo').value;
            phone = document.getElementById('regPhone_ngo').value;
            password = document.getElementById('regPass_ngo').value;
            
            extraData = {
                ngoName: document.getElementById('ngoName').value,
                ngoRegNo: document.getElementById('ngoRegNo').value,
                location: document.getElementById('location').value,
                ngoType: document.getElementById('ngoType').value
            };
            status = 'pending'; // Requires authority approval
            
        } else if (role === 'public') {
            name = document.getElementById('regName_public').value;
            phone = document.getElementById('regPhone_public').value;
            password = document.getElementById('regPass_public').value;
            
            extraData = {
                address: document.getElementById('address_public').value
            };
            status = 'approved';
        }
        
        // Prepare user document payload
        const newUser = {
            name: name,
            username: name, // using Full Name as the username field in DB for logins
            phone: phone,
            password: password,
            role: role,
            status: status,
            ...extraData,
            createdAt: new Date().toISOString()
        };
        
        // 5: Call addDoc
        await addDoc(collection(db, 'users'), newUser);
        
        // 6: Show success message and redirect
        let successMsg = 'Registration successful! You can now log in.';
        if (status === 'pending') {
            successMsg = 'Registration successful! Your account is pending authority approval.';
        }
        
        if (window.showModal) {
            await window.showModal('Registration Complete', successMsg);
            window.location.href = 'index.html';
        } else {
            alert(successMsg);
            window.location.href = 'index.html';
        }
        
    } catch (error) {
        console.error("Error registering user:", error);
        if (window.showModal) {
            await window.showModal('Error', 'An error occurred during registration. Ensure Firebase Config is correct.');
        } else {
            alert('An error occurred during registration. Ensure Firebase Config is correct.');
        }
    } finally {
        hideLoading();
    }
};
