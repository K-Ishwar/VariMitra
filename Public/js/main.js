import { dict } from './dict.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Language Initialization
    let currentLang = localStorage.getItem('lang') || 'en';
    applyTranslations(currentLang);
    setupLangToggles();

    // 2. Dashboard Gatekeeper
    setupGatekeeper();
});

function applyTranslations(lang) {
    if (!dict[lang]) lang = 'en';
    
    // Update active button classes
    const btnEN = document.getElementById('btnEN');
    const btnMR = document.getElementById('btnMR');
    if (btnEN) btnEN.classList.toggle('active', lang === 'en');
    if (btnMR) btnMR.classList.toggle('active', lang === 'mr');
    
    // Update body font if Marathi
    if (lang === 'mr') {
        document.body.style.fontFamily = "'Noto Sans Devanagari', 'Inter', sans-serif";
    } else {
        document.body.style.fontFamily = "'Inter', 'Noto Sans Devanagari', sans-serif";
    }

    // Translate all elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[lang][key]) {
            el.innerText = dict[lang][key];
        }
    });

    // Translate all elements with data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (dict[lang][key]) {
            el.setAttribute('placeholder', dict[lang][key]);
        }
    });
}

function setupLangToggles() {
    const btnEN = document.getElementById('btnEN');
    const btnMR = document.getElementById('btnMR');
    
    if (btnEN) {
        btnEN.addEventListener('click', () => {
            localStorage.setItem('lang', 'en');
            applyTranslations('en');
        });
    }
    
    if (btnMR) {
        btnMR.addEventListener('click', () => {
            localStorage.setItem('lang', 'mr');
            applyTranslations('mr');
        });
    }
}

function setupGatekeeper() {
    const userRole = localStorage.getItem('userRole');
    
    // Check if we are on the dashboard
    const displayRole = document.getElementById('displayRole');
    if (!displayRole) return; 
    
    // If no role in localStorage, redirect to login
    if (!userRole) {
        window.location.href = 'index.html';
        return;
    }

    // Set role name in the UI using current language
    const lang = localStorage.getItem('lang') || 'en';
    displayRole.innerText = dict[lang][`role_${userRole}`] || userRole;

    // Helper function to unhide elements
    const showElements = (panelId, navIds) => {
        const panel = document.getElementById(panelId);
        if (panel) panel.style.display = 'block';
        
        navIds.forEach(id => {
            const nav = document.getElementById(id);
            if (nav) nav.style.display = 'block';
        });
    };
    
    // Logout is always shown if logged in
    const logoutBtn = document.getElementById('nav-logout');
    if (logoutBtn) logoutBtn.style.display = 'block';

    // Role-based logic
    switch (userRole) {
        case 'super_admin':
            showElements('panel-super', ['nav-alerts', 'nav-map']);
            break;
        case 'authority':
            showElements('panel-authority', ['nav-alerts', 'nav-map']);
            break;
        case 'dindi_leader':
        case 'dindi_helper':
            showElements('panel-dindi', ['nav-lostfound']);
            if (window.initDindiMap) {
                // slight delay to ensure div is rendered with dimensions before Leaflet initializes
                setTimeout(() => window.initDindiMap(), 50);
            }
            break;
        case 'ngo':
            showElements('panel-ngo', ['nav-seva', 'nav-map']);
            break;
        case 'public':
            showElements('panel-public', ['nav-lostfound', 'nav-seva', 'nav-sanitation']);
            break;
        default:
            window.location.href = 'index.html';
    }
}

// Global Custom Modals Injection
function createModalStyles() {
    if (document.getElementById('modal-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'modal-styles';
    style.textContent = `
        .modal-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(27, 35, 64, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        .modal-overlay.show {
            opacity: 1;
        }
        .modal-box {
            background: var(--paper);
            padding: 24px;
            border-radius: 16px;
            width: 90%;
            max-width: 400px;
            border: 1px solid var(--line);
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            transform: scale(0.9);
            transition: transform 0.3s ease;
        }
        .modal-overlay.show .modal-box {
            transform: scale(1);
        }
        .modal-title {
            font-family: var(--font-heading);
            font-size: 20px;
            color: var(--ink);
            margin: 0 0 12px 0;
        }
        .modal-message {
            font-size: 14px;
            color: var(--sage);
            margin: 0 0 24px 0;
            line-height: 1.5;
        }
        .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }
        .btn-cancel {
            background: transparent;
            border: 1px solid var(--line);
            color: var(--ink);
            padding: 8px 16px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 500;
            transition: background 0.2s ease;
        }
        .btn-cancel:hover {
            background: var(--paper-2);
        }
        .btn-confirm {
            background: var(--marigold-deep);
            border: none;
            color: white;
            padding: 8px 16px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 500;
            transition: transform 0.2s ease, background 0.2s ease;
        }
        .btn-confirm:hover {
            transform: scale(1.05);
            background: var(--marigold);
        }
    `;
    document.head.appendChild(style);
}

window.showModal = function(title, message) {
    return new Promise((resolve) => {
        createModalStyles();
        
        const lang = localStorage.getItem('lang') || 'en';
        const okText = dict[lang]?.modal_ok || 'OK';

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-box">
                <h3 class="modal-title">${title}</h3>
                <p class="modal-message">${message}</p>
                <div class="modal-actions">
                    <button class="btn-confirm" id="modal-ok-btn">${okText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // Trigger reflow for animation
        void overlay.offsetWidth;
        overlay.classList.add('show');
        
        const close = () => {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.remove();
                resolve();
            }, 300);
        };
        
        document.getElementById('modal-ok-btn').addEventListener('click', close);
    });
};

window.showConfirmModal = function(title, message) {
    return new Promise((resolve) => {
        createModalStyles();
        
        const lang = localStorage.getItem('lang') || 'en';
        const okText = dict[lang]?.modal_ok || 'OK';
        const cancelText = dict[lang]?.modal_cancel || 'Cancel';

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-box">
                <h3 class="modal-title">${title}</h3>
                <p class="modal-message">${message}</p>
                <div class="modal-actions">
                    <button class="btn-cancel" id="modal-cancel-btn">${cancelText}</button>
                    <button class="btn-confirm" id="modal-confirm-btn">${okText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // Trigger reflow for animation
        void overlay.offsetWidth;
        overlay.classList.add('show');
        
        const close = (result) => {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.remove();
                resolve(result);
            }, 300);
        };
        
        document.getElementById('modal-cancel-btn').addEventListener('click', () => close(false));
        document.getElementById('modal-confirm-btn').addEventListener('click', () => close(true));
    });
};

// Logout handler
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('nav-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            const lang = localStorage.getItem('lang') || 'en';
            const confirmMsg = lang === 'mr' ? 'तुम्हाला नक्की बाहेर पडायचे आहे का?' : 'Are you sure you want to log out?';
            const shouldLogout = await window.showConfirmModal('Logout / बाहेर पडा', confirmMsg);
            
            if (shouldLogout) {
                localStorage.removeItem('userRole');
                window.location.href = 'index.html';
            }
        });
    }
});
