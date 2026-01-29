// ============================================
// GOOGLE SHEETS INTEGRATION CONFIG
// ============================================
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwKpK2IA9z23sJVl53zxw9N7AQgI0YdJFcyqbxGl6TdwFpy1OM2eEEgMmNrCCxPytA00A/exec';

// ============================================
// PROJECT DATA
// ============================================
const projectsData = {
    1: {
        title: "Smart-Exam-Evaluator",
        description: "An AI-powered exam evaluation system that automates grading of handwritten multiple-choice answer sheets using Google Gemini, Flask, and OpenCV. It enables educators to set up tests, process scanned answer sheets, and generate detailed Excel-based performance reports. The platform supports real-time analysis, consolidated reporting, and an intuitive frontend dashboard for seamless test management.",
        techStack: ["Flask", "Google Gemini API", "OpenCV", "JavaScript", "HTML", "CSS", "OpenPyXL", "Pandas","Machine Learning"],
        github: "https://github.com/SriramKannan2005/Smart-Exam-Evaluvator",
        video: "videos/smart.mp4"
    },
    2: {
        title: "GenAI Multi-Document Intelligence System",
        description: "An advanced AI-powered document analysis platform that enables users to upload, analyze, and query multiple documents simultaneously. The system leverages Generative AI and Natural Language Processing to extract contextual insights, provide precise citations, and deliver intelligent responses with real-time analytics through interactive visualizations.",
        techStack: ["HTML", "CSS", "JavaScript", "Chart.js", "Generative AI", "NLP", "Flask", "Google Gemini API","Machine Learning"],
        github: "https://github.com/SriramKannan2005/Info-Nexus",
        video: "videos/doc.mp4"
    },
    3: {
        title: "CineHome+ | AI-Powered Personal Cinema",
        description: "An intelligent, locally hosted OTT-style platform that transforms your personal video library into an immersive cinema experience. CineHome+ integrates gesture-based video controls, AI-powered chat assistance, and user-adaptive recommendations using the Gemini API. It supports video streaming, watch history, and real-time interactions for a seamless home-theater experience.",
        techStack: ["HTML", "CSS", "JavaScript", "Flask", "MediaPipe", "OpenCV", "Google Gemini API", "AI Chatbot", "Gesture Recognition", "Computer Vision"],
        github: "https://github.com/SriramKannan2005/media-player",
        video: "videos/me.mp4"
    }
};

// ============================================
// NAVIGATION & MENU
// ============================================
const hamburger = document.getElementById('hamburger');
const navLinks = document.querySelector('.nav-links');

if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navLinks.classList.toggle('active');
        document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : 'auto';
    });

    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navLinks.classList.remove('active');
            document.body.style.overflow = 'auto';
        });
    });
}

// ============================================
// SMOOTH SCROLLING
// ============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const headerOffset = 80;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// ============================================
// HEADER SCROLL EFFECTS
// ============================================
const header = document.querySelector('header');
if (header) {
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        if (currentScroll <= 0) {
            header.style.boxShadow = '0 2px 10px var(--shadow)';
        } else {
            header.style.boxShadow = '0 5px 20px var(--shadow-lg)';
        }
    });
}

// ============================================
// THEME TOGGLE
// ============================================
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

if (themeToggle) {
    const currentTheme = localStorage.getItem('theme') || 'light';
    html.setAttribute('data-theme', currentTheme);
    updateThemeIcon(currentTheme);

    themeToggle.addEventListener('click', () => {
        const theme = html.getAttribute('data-theme');
        const newTheme = theme === 'light' ? 'dark' : 'light';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });
}

function updateThemeIcon(theme) {
    const icon = themeToggle?.querySelector('i');
    if (!icon) return;
    
    if (theme === 'dark') {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    } else {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    }
}

// ============================================
// PROJECT MODAL WITH VIEW TRACKING
// ============================================
const modal = document.getElementById('projectModal');
const closeBtn = modal?.querySelector('.close');
const projectCards = document.querySelectorAll('.project-card');

// Keep track of current project
let currentProjectId = null;
const projectIds = Array.from(projectCards).map(card => card.getAttribute('data-project'));

projectCards.forEach(card => {
    const viewDetailsBtn = card.querySelector('.view-details');
    if (viewDetailsBtn) {
        viewDetailsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const projectId = card.getAttribute('data-project');
            openModal(projectId);
            // Track view ONLY when "View Details" is clicked
            trackProjectView(projectId);
        });
    }
});

function openModal(projectId) {
    const project = projectsData[projectId];
    if (!project || !modal) return;
    
    currentProjectId = projectId; // Store current project ID
    
    const modalTitle = document.getElementById('modalTitle');
    const modalDescription = document.getElementById('modalDescription');
    const modalGithub = document.getElementById('modalGithub');
    const video = document.getElementById('modalVideo');
    const techStackContainer = document.getElementById('modalTechStack');
    
    if (modalTitle) modalTitle.textContent = project.title;
    if (modalDescription) modalDescription.textContent = project.description;
    if (modalGithub) modalGithub.href = project.github;
    
    if (video) {
        video.src = project.video;
        video.play().catch(e => console.log('Video autoplay prevented'));
    }
    
    if (techStackContainer) {
        techStackContainer.innerHTML = '';
        project.techStack.forEach(tech => {
            const span = document.createElement('span');
            span.textContent = tech;
            techStackContainer.appendChild(span);
        });
    }
    
    // Update like button for this project
    const likeBtn = document.getElementById('likeProjectBtn');
    if (likeBtn) {
        likeBtn.onclick = () => likeProject(projectId);
        likeBtn.disabled = false;
        likeBtn.innerHTML = '<i class="fas fa-heart"></i> Like Project';
        likeBtn.style.background = '';
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    const video = document.getElementById('modalVideo');
    if (video) video.pause();
    currentProjectId = null;
}

if (closeBtn) closeBtn.addEventListener('click', closeModal);
window.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// ============================================
// ARROW KEY NAVIGATION FOR PROJECTS
// ============================================
document.addEventListener('keydown', (e) => {
    // Only work if modal is open
    if (!modal?.classList.contains('active') || !currentProjectId) return;
    
    const currentIndex = projectIds.indexOf(currentProjectId);
    
    if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        const previousProjectId = projectIds[currentIndex - 1];
        openModal(previousProjectId);
        trackProjectView(previousProjectId);
    }
    
    if (e.key === 'ArrowRight' && currentIndex < projectIds.length - 1) {
        e.preventDefault();
        const nextProjectId = projectIds[currentIndex + 1];
        openModal(nextProjectId);
        trackProjectView(nextProjectId);
    }
    
    if (e.key === 'Escape') {
        closeModal();
    }
});

// ============================================
// PROJECT VIEW TRACKING (Only on View Details click)
// ============================================
async function trackProjectView(projectId) {
    try {
        if (window.firebaseDb && window.firebaseModules) {
            const { collection, addDoc, Timestamp } = window.firebaseModules;
            await addDoc(collection(window.firebaseDb, 'projectViews'), {
                projectId: projectId,
                timestamp: Timestamp.now(),
                date: new Date().toLocaleDateString()
            });
            
            console.log(`✅ Project ${projectId} view tracked`);
            
            // Update view count in UI
            updateProjectViewCount(projectId);
        }
    } catch (error) {
        console.error('Error tracking project view:', error);
    }
}

async function updateProjectViewCount(projectId) {
    try {
        if (window.firebaseDb && window.firebaseModules) {
            const { collection, query, where, getDocs } = window.firebaseModules;
            const q = query(collection(window.firebaseDb, 'projectViews'), where('projectId', '==', projectId));
            const querySnapshot = await getDocs(q);
            const viewCount = querySnapshot.size;
            
            const card = document.querySelector(`[data-project="${projectId}"]`);
            if (card) {
                const viewCountElement = card.querySelector('.view-count');
                if (viewCountElement) {
                    viewCountElement.textContent = viewCount;
                }
            }
        }
    } catch (error) {
        console.error('Error updating view count:', error);
    }
}

// ============================================
// PROJECT LIKE TRACKING
// ============================================
async function likeProject(projectId) {
    try {
        const likeBtn = document.getElementById('likeProjectBtn');
        
        // Check if already liked (using localStorage)
        const likedProjects = JSON.parse(localStorage.getItem('likedProjects') || '[]');
        if (likedProjects.includes(projectId)) {
            showSuccessToast('Already Liked!', 'You already liked this project.');
            return;
        }
        
        if (window.firebaseDb && window.firebaseModules) {
            const { collection, addDoc, Timestamp } = window.firebaseModules;
            await addDoc(collection(window.firebaseDb, 'projectLikes'), {
                projectId: projectId,
                timestamp: Timestamp.now(),
                date: new Date().toLocaleDateString()
            });
            
            // Store in localStorage to prevent multiple likes
            likedProjects.push(projectId);
            localStorage.setItem('likedProjects', JSON.stringify(likedProjects));
            
            likeBtn.innerHTML = '<i class="fas fa-heart"></i> Liked!';
            likeBtn.style.background = '#ec4899';
            likeBtn.disabled = true;
            
            showSuccessToast('Thank You!', 'Project liked successfully!');
            updateProjectLikeCount(projectId);
        }
    } catch (error) {
        console.error('Error liking project:', error);
    }
}

async function updateProjectLikeCount(projectId) {
    try {
        if (window.firebaseDb && window.firebaseModules) {
            const { collection, query, where, getDocs } = window.firebaseModules;
            const q = query(collection(window.firebaseDb, 'projectLikes'), where('projectId', '==', projectId));
            const querySnapshot = await getDocs(q);
            const likeCount = querySnapshot.size;
            
            const card = document.querySelector(`[data-project="${projectId}"]`);
            if (card) {
                const likeCountElement = card.querySelector('.like-count');
                if (likeCountElement) {
                    likeCountElement.textContent = likeCount;
                }
            }
        }
    } catch (error) {
        console.error('Error updating like count:', error);
    }
}

// ============================================
// LOAD PROJECT STATS ON PAGE LOAD
// ============================================
async function loadProjectStats() {
    const projectCards = document.querySelectorAll('.project-card');
    
    for (const card of projectCards) {
        const projectId = card.getAttribute('data-project');
        await updateProjectViewCount(projectId);
        await updateProjectLikeCount(projectId);
    }
}

// Load stats when page loads
window.addEventListener('load', () => {
    setTimeout(loadProjectStats, 2000);
});

// Make functions available globally
window.trackProjectView = trackProjectView;
window.likeProject = likeProject;
window.openModal = openModal;
// ============================================
// RESUME MODAL - ALL DEVICES, NO TOOLBARS, CLEAN CONSOLE
// ============================================
const resumeModal = document.getElementById('resumeModal');
const viewResumeBtn = document.getElementById('viewResumeBtn');
const closeResumeBtn = document.getElementById('closeResumeModal');
const resumeFrame = document.getElementById('resumeFrame');

if (viewResumeBtn && resumeModal && resumeFrame) {
    viewResumeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        
        if (isIOS) {
            // iOS - use object/embed tag (best compatibility)
            resumeFrame.innerHTML = `
                <object data="resume.pdf#toolbar=0&navpanes=0&scrollbar=1&view=FitH" 
                        type="application/pdf" 
                        style="width:100%; height:100%; border:none;">
                    <embed src="resume.pdf#toolbar=0&navpanes=0&scrollbar=1&view=FitH" 
                           type="application/pdf" 
                           style="width:100%; height:100%; border:none;" />
                </object>
            `;
        } else {
            // All other devices - direct PDF with no toolbar
            resumeFrame.src = 'resume.pdf#toolbar=0&navpanes=0&scrollbar=1&view=FitH&zoom=page-fit';
        }
        
        resumeModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
}

if (closeResumeBtn && resumeModal) {
    closeResumeBtn.addEventListener('click', () => {
        resumeModal.classList.remove('active');
        document.body.style.overflow = 'auto';
        if (resumeFrame) {
            resumeFrame.src = '';
            resumeFrame.innerHTML = '';
        }
    });
}

window.addEventListener('click', (e) => {
    if (e.target === resumeModal) {
        resumeModal.classList.remove('active');
        document.body.style.overflow = 'auto';
        if (resumeFrame) {
            resumeFrame.src = '';
            resumeFrame.innerHTML = '';
        }
    }
});
// ============================================
// KEYBOARD SHORTCUTS (Mac & Windows Compatible)
// ============================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (modal?.classList.contains('active')) closeModal();
        if (resumeModal?.classList.contains('active')) {
            resumeModal.classList.remove('active');
            document.body.style.overflow = 'auto';
            if (resumeFrame) resumeFrame.src = '';
        }
        if (adminLoginModal?.classList.contains('active')) {
            adminLoginModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    }
    
    // Admin Access: Ctrl+Shift+A (Windows/Linux) or Cmd+Shift+A (Mac)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        showAdminLogin();
    }
});

// ============================================
// SUCCESS TOAST
// ============================================
const successToast = document.getElementById('successToast');
const toastCloseBtn = successToast?.querySelector('.toast-close');

function showSuccessToast(title = 'Message Sent Successfully!', message = "Thank you for reaching out. I'll get back to you soon!") {
    if (!successToast) return;
    
    const toastTitle = successToast.querySelector('h3');
    const toastMessage = successToast.querySelector('p');
    
    if (toastTitle) toastTitle.textContent = title;
    if (toastMessage) toastMessage.textContent = message;
    
    successToast.classList.add('show');
    setTimeout(() => hideSuccessToast(), 5000);
}

function hideSuccessToast() {
    if (successToast) successToast.classList.remove('show');
}

if (toastCloseBtn) toastCloseBtn.addEventListener('click', hideSuccessToast);

// ✅ ADD THIS LINE - Make it globally accessible
window.showSuccessToast = showSuccessToast;
window.hideSuccessToast = hideSuccessToast;

// ============================================
// CONTACT FORM
// ============================================
const contactForm = document.getElementById('contactForm');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const messageInput = document.getElementById('message');
const submitBtn = document.getElementById('submitBtn');

if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let isValid = true;
        document.querySelectorAll('.form-group').forEach(group => {
            group.classList.remove('error');
            const errorMsg = group.querySelector('.error-message');
            if (errorMsg) errorMsg.textContent = '';
        });
        
        if (!nameInput || nameInput.value.trim() === '' || nameInput.value.trim().length < 2) {
            showError(nameInput, 'Please enter a valid name (at least 2 characters)');
            isValid = false;
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailInput || !emailRegex.test(emailInput.value.trim())) {
            showError(emailInput, 'Please enter a valid email address');
            isValid = false;
        }
        
        if (!messageInput || messageInput.value.trim().length < 10) {
            showError(messageInput, 'Message must be at least 10 characters');
            isValid = false;
        }
        
        if (isValid) {
            await saveMessageToFirebase();
        }
    });
}

function showError(input, message) {
    if (!input) return;
    const formGroup = input.parentElement;
    formGroup.classList.add('error');
    const errorMsg = formGroup.querySelector('.error-message');
    if (errorMsg) errorMsg.textContent = message;
}



// ============================================
// PAGE VIEW TRACKING
// ============================================
async function trackPageView() {
    try {
        if (window.firebaseDb && window.firebaseModules) {
            const { collection, addDoc, Timestamp } = window.firebaseModules;
            await addDoc(collection(window.firebaseDb, 'analytics'), {
                type: 'pageview',
                timestamp: Timestamp.now(),
                date: new Date().toLocaleDateString(),
                path: window.location.pathname
            });
        }
    } catch (error) {
        console.error('Error tracking page view:', error);
    }
}

window.addEventListener('load', () => {
    trackPageView();
});

// ============================================
// CUSTOM CONFIRMATION MODAL - COMPLETELY FIXED
// ============================================

// Store references globally
let confirmResolve = null;

function showConfirmModal(title, message) {
    return new Promise((resolve) => {
        console.log('🔔 showConfirmModal called:', title);
        
        const confirmModal = document.getElementById('confirmModal');
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmMessage = document.getElementById('confirmMessage');
        const confirmOk = document.getElementById('confirmOk');
        const confirmCancel = document.getElementById('confirmCancel');
        
        // Verify all elements exist
        if (!confirmModal || !confirmTitle || !confirmMessage || !confirmOk || !confirmCancel) {
            console.error('❌ Modal elements missing, falling back to native confirm');
            resolve(confirm(message));
            return;
        }
        
        // Store resolve function globally
        confirmResolve = resolve;
        
        // Set content
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        
        // Show modal
        confirmModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        console.log('✅ Custom modal displayed');
    });
}

// Handle OK button - MUST BE OUTSIDE THE PROMISE
document.addEventListener('DOMContentLoaded', () => {
    const confirmOk = document.getElementById('confirmOk');
    const confirmCancel = document.getElementById('confirmCancel');
    const confirmModal = document.getElementById('confirmModal');
    
    if (confirmOk) {
        confirmOk.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('✅ OK clicked');
            
            if (confirmModal) {
                confirmModal.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
            
            if (confirmResolve) {
                confirmResolve(true);
                confirmResolve = null;
            }
        });
        console.log('✅ OK button listener attached');
    }
    
    if (confirmCancel) {
        confirmCancel.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('❌ Cancel clicked');
            
            if (confirmModal) {
                confirmModal.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
            
            if (confirmResolve) {
                confirmResolve(false);
                confirmResolve = null;
            }
        });
        console.log('✅ Cancel button listener attached');
    }
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && confirmModal?.classList.contains('active')) {
            console.log('❌ Escape pressed');
            confirmModal.classList.remove('active');
            document.body.style.overflow = 'auto';
            
            if (confirmResolve) {
                confirmResolve(false);
                confirmResolve = null;
            }
        }
    });
    
    // Close on outside click
    if (confirmModal) {
        confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal) {
                console.log('❌ Clicked outside');
                confirmModal.classList.remove('active');
                document.body.style.overflow = 'auto';
                
                if (confirmResolve) {
                    confirmResolve(false);
                    confirmResolve = null;
                }
            }
        });
    }
});

// Make globally available
window.showConfirmModal = showConfirmModal;
console.log('✅ showConfirmModal defined globally');
// ============================================
// ADMIN PANEL
// ============================================
const adminLoginModal = document.getElementById('adminLoginModal');
const adminPanel = document.getElementById('adminPanel');
const adminLoginForm = document.getElementById('adminLoginForm');
const closeAdminLogin = document.getElementById('closeAdminLogin');
const logoutBtn = document.getElementById('logoutBtn');
const secretLogo = document.getElementById('secretLogo');

let logoClickCount = 0;
let logoClickTimer;

if (secretLogo) {
    secretLogo.addEventListener('click', () => {
        logoClickCount++;
        if (logoClickCount === 1) {
            logoClickTimer = setTimeout(() => {
                logoClickCount = 0;
            }, 500);
        }
        if (logoClickCount === 3) {
            clearTimeout(logoClickTimer);
            logoClickCount = 0;
            showAdminLogin();
        }
    });
}

function showAdminLogin() {
    if (window.firebaseAuth && window.firebaseModules) {
        const { onAuthStateChanged } = window.firebaseModules;
        onAuthStateChanged(window.firebaseAuth, (user) => {
            if (user) {
                showAdminPanel(user);
            } else {
                if (adminLoginModal) {
                    adminLoginModal.classList.add('active');
                    document.body.style.overflow = 'hidden';
                }
            }
        });
    }
}

if (closeAdminLogin && adminLoginModal) {
    closeAdminLogin.addEventListener('click', () => {
        adminLoginModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    });
}

if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const emailField = document.getElementById('adminEmail');
        const passwordField = document.getElementById('adminPassword');
        const loginError = document.getElementById('loginError');
        
        if (!emailField || !passwordField) return;
        
        const email = emailField.value;
        const password = passwordField.value;
        
        const btnText = adminLoginForm.querySelector('.btn-text');
        const btnLoader = adminLoginForm.querySelector('.btn-loader');
        if (btnText) btnText.style.display = 'none';
        if (btnLoader) btnLoader.style.display = 'inline';
        
        try {
            if (window.firebaseAuth && window.firebaseModules) {
                const { signInWithEmailAndPassword } = window.firebaseModules;
                const userCredential = await signInWithEmailAndPassword(window.firebaseAuth, email, password);
                
                if (adminLoginModal) adminLoginModal.classList.remove('active');
                showAdminPanel(userCredential.user);
            }
        } catch (error) {
            console.error('Login error:', error);
            if (loginError) {
                loginError.textContent = 'Invalid credentials. Please try again.';
                loginError.style.display = 'block';
            }
        } finally {
            if (btnText) btnText.style.display = 'inline';
            if (btnLoader) btnLoader.style.display = 'none';
        }
    });
}
function showAdminPanel(user) {
    if (!adminPanel) return;
    
    adminPanel.style.display = 'block';
    document.body.style.overflow = 'auto';
    
    const adminUserEmail = document.getElementById('adminUserEmail');
    if (adminUserEmail) adminUserEmail.textContent = user.email;
    
    loadAdminContent();
    loadMessages();
    loadAnalytics();
    
    // ✅ Attach Mark All Read listener when panel opens
    setTimeout(() => {
        if (typeof window.attachMarkAllReadListener === 'function') {
            window.attachMarkAllReadListener();
        }
    }, 500);
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            if (window.firebaseAuth && window.firebaseModules) {
                const { signOut } = window.firebaseModules;
                await signOut(window.firebaseAuth);
            }
            if (adminPanel) adminPanel.style.display = 'none';
        } catch (error) {
            console.error('Logout error:', error);
        }
    });
}

// ============================================
// ADMIN TABS
// ============================================
const adminTabs = document.querySelectorAll('.admin-tab');
const adminTabContents = document.querySelectorAll('.admin-tab-content');

adminTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        
        adminTabs.forEach(t => t.classList.remove('active'));
        adminTabContents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        const tabContent = document.getElementById(tabName + 'Tab');
        if (tabContent) tabContent.classList.add('active');
        
        if (tabName === 'messages') {
            loadMessages();
        } else if (tabName === 'analytics') {
            loadAnalytics();
        }
    });
});



// ============================================
// MESSAGE CATEGORIZATION
// ============================================
function categorizeMessage(message) {
    const text = message.toLowerCase();
    
    // Job/Career related keywords
    if (text.includes('job') || text.includes('hire') || text.includes('position') || 
        text.includes('career') || text.includes('recruit') || text.includes('opportunity')) {
        return 'Job Inquiry';
    }
    
    // Project/Collaboration keywords
    if (text.includes('project') || text.includes('collaborate') || text.includes('work together') || 
        text.includes('partnership') || text.includes('freelance')) {
        return 'Collaboration';
    }
    
    // Technical/Help keywords
    if (text.includes('help') || text.includes('question') || text.includes('how to') || 
        text.includes('issue') || text.includes('problem') || text.includes('error')) {
        return 'Technical Question';
    }
    
    // Feedback keywords
    if (text.includes('feedback') || text.includes('suggestion') || text.includes('improve') || 
        text.includes('great') || text.includes('awesome') || text.includes('love')) {
        return 'Feedback';
    }
    
    // Default category
    return 'General';
}

// ============================================
// UPDATE CONTACT FORM TO INCLUDE CATEGORY
// ============================================
async function saveMessageToFirebase() {
    if (!nameInput || !emailInput || !messageInput || !submitBtn) return;
    
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const message = messageInput.value.trim();
    
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    if (btnText) btnText.style.display = 'none';
    if (btnLoader) btnLoader.style.display = 'inline';
    submitBtn.disabled = true;
    
    try {
        const messageData = {
            name: name,
            email: email,
            message: message,
            category: categorizeMessage(message), // ✅ Add category
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleString(),
            read: false
        };
        
        if (window.firebaseDb && window.firebaseModules) {
            const { collection, addDoc } = window.firebaseModules;
            await addDoc(collection(window.firebaseDb, 'messages'), messageData);
            console.log('✅ Message saved to Firebase with category:', messageData.category);
        }
        
        await sendToGoogleSheets(messageData);
        await trackPageView();
        
        if (contactForm) contactForm.reset();
        showSuccessToast('Message Sent!', 'Your message has been saved successfully!');
        
    } catch (error) {
        console.error('❌ Error saving message:', error);
        showSuccessToast('Error!', 'Failed to send message. Please try again.');
    } finally {
        if (btnText) btnText.style.display = 'inline';
        if (btnLoader) btnLoader.style.display = 'none';
        submitBtn.disabled = false;
    }
}
// ============================================
// SEND MESSAGE TO GOOGLE SHEETS
// ============================================
async function sendToGoogleSheets(messageData) {
    try {
        const sheetData = {
            name: messageData.name,
            email: messageData.email,
            message: messageData.message,
            category: messageData.category || 'General', // ✅ Include category
            date: messageData.date,
            read: messageData.read ? 'Yes' : 'No'
        };
        
        const response = await fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify(sheetData),
            mode: 'no-cors' // ✅ Required for Google Apps Script
        });
        
        console.log('✅ Message sent to Google Sheets');
        return true;
        
    } catch (error) {
        console.error('❌ Error sending to Google Sheets:', error);
        // Don't throw error - we don't want to block Firebase save if Sheets fails
        return false;
    }
}

// Make it globally available
window.sendToGoogleSheets = sendToGoogleSheets;

// ============================================
// MESSAGES MANAGEMENT
// ============================================
let currentFilter = 'all';

async function loadMessages() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    messagesContainer.innerHTML = '<div class="loading-messages"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>';
    
    try {
        let messages = [];
        
        if (window.firebaseDb && window.firebaseModules) {
            const { collection, getDocs, query, orderBy } = window.firebaseModules;
            const q = query(collection(window.firebaseDb, 'messages'), orderBy('timestamp', 'desc'));
            const querySnapshot = await getDocs(q);
            
            querySnapshot.forEach((doc) => {
                messages.push({ id: doc.id, ...doc.data() });
            });
        }
        
        displayMessages(messages);
        const messageCount = document.getElementById('messageCount');
        if (messageCount) {
            messageCount.textContent = messages.length;
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        messagesContainer.innerHTML = '<div class="no-messages"><i class="fas fa-exclamation-circle"></i><p>Error loading messages</p></div>';
    }
}

function displayMessages(messages) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    let filteredMessages = messages;
    if (currentFilter === 'unread') {
        filteredMessages = messages.filter(msg => !msg.read);
    } else if (currentFilter === 'read') {
        filteredMessages = messages.filter(msg => msg.read);
    }
    
    if (filteredMessages.length === 0) {
        messagesContainer.innerHTML = '<div class="no-messages"><i class="fas fa-inbox"></i><p>No messages yet</p></div>';
        return;
    }
    
    messagesContainer.innerHTML = '';
    
    // Category colors
    const categoryColors = {
        'Job Inquiry': '#6366f1',
        'Collaboration': '#8b5cf6',
        'Technical Question': '#ec4899',
        'Feedback': '#10b981',
        'General': '#f59e0b'
    };
    
    filteredMessages.forEach(msg => {
        const messageCard = document.createElement('div');
        messageCard.className = 'message-card' + (msg.read ? '' : ' unread');
        
        const categoryColor = categoryColors[msg.category] || '#f59e0b';
        
        messageCard.innerHTML = `
            <div class="message-header">
                <div class="message-info">
                    <h4>
                        ${msg.name} 
                        ${!msg.read ? '<span class="unread-badge">New</span>' : ''}
                        ${msg.category ? `<span class="category-badge" style="background: ${categoryColor}; color: white; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.75rem; margin-left: 0.5rem; font-weight: 600;">
                            ${msg.category}
                        </span>` : ''}
                    </h4>
                    <p>${msg.email}</p>
                </div>
                <div class="message-actions">
                    ${!msg.read ? `<button class="mark-read-btn" data-id="${msg.id}">
                        <i class="fas fa-check"></i> Mark Read
                    </button>` : ''}
                    <button class="delete-btn" data-id="${msg.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
            <div class="message-body">${msg.message}</div>
            <div class="message-date">
                <i class="fas fa-clock"></i> ${msg.date || new Date(msg.timestamp).toLocaleString()}
            </div>
        `;
        
        messagesContainer.appendChild(messageCard);
    });
    
    // Attach event listeners
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteMessage(btn.getAttribute('data-id')));
    });
    
    document.querySelectorAll('.mark-read-btn').forEach(btn => {
        btn.addEventListener('click', () => markAsRead(btn.getAttribute('data-id')));
    });
}

// ============================================
// MESSAGE FILTER BUTTONS
// ============================================
const messageFilterButtons = document.querySelectorAll('.message-filters .filter-btn');
if (messageFilterButtons.length > 0) {
    messageFilterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.message-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter');
            loadMessages();
        });
    });
}

// ============================================
// MARK AS READ
// ============================================
async function markAsRead(id) {
    try {
        if (window.firebaseDb && window.firebaseModules) {
            const { doc, updateDoc } = window.firebaseModules;
            await updateDoc(doc(window.firebaseDb, 'messages', id), {
                read: true
            });
        }
        await loadMessages();
        if (typeof loadAnalytics === 'function') {
            await loadAnalytics();
        }
        showSuccessToast('Updated!', 'Message marked as read.');
    } catch (error) {
        console.error('Error marking message as read:', error);
        showSuccessToast('Error!', 'Failed to mark message as read.');
    }
}

// ============================================
// MARK ALL AS READ - FIXED VERSION
// ============================================
async function markAllMessagesAsRead() {
    console.log('🔄 markAllMessagesAsRead called');
    
    try {
        // Use custom modal
        const confirmed = await showConfirmModal(
            '📬 Mark All as Read?',
            'This will mark all unread messages as read. You can still access them later, but they won\'t show as "new" anymore.'
        );
        
        console.log('User response:', confirmed);
        
        if (!confirmed) {
            console.log('❌ User cancelled');
            return;
        }
        
        console.log('✅ User confirmed, proceeding...');
        
        const markAllReadBtn = document.getElementById('markAllRead');
        if (!markAllReadBtn) {
            console.error('❌ Button not found');
            return;
        }
        
        const originalHTML = markAllReadBtn.innerHTML;
        markAllReadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Marking...';
        markAllReadBtn.disabled = true;
        
        try {
            if (!window.firebaseDb || !window.firebaseModules) {
                throw new Error('Firebase not initialized');
            }
            
            const { collection, getDocs, doc, updateDoc, query, where } = window.firebaseModules;
            
            console.log('📊 Querying unread messages...');
            const messagesRef = collection(window.firebaseDb, 'messages');
            const unreadQuery = query(messagesRef, where('read', '==', false));
            const querySnapshot = await getDocs(unreadQuery);
            
            const unreadCount = querySnapshot.size;
            console.log(`📨 Found ${unreadCount} unread messages`);
            
            if (unreadCount === 0) {
                showSuccessToast(
                    '📭 Inbox Zero!', 
                    'You\'re all caught up! No unread messages remaining.'
                );
                markAllReadBtn.innerHTML = originalHTML;
                markAllReadBtn.disabled = false;
                return;
            }
            
            console.log('🔄 Updating messages...');
            const updatePromises = [];
            querySnapshot.forEach((docSnapshot) => {
                const docRef = doc(window.firebaseDb, 'messages', docSnapshot.id);
                updatePromises.push(updateDoc(docRef, { read: true }));
            });
            
            await Promise.all(updatePromises);
            console.log(`✅ ${unreadCount} messages marked as read`);
            
            // Reload
            if (typeof loadMessages === 'function') {
                await loadMessages();
            }
            if (typeof loadAnalytics === 'function') {
                await loadAnalytics();
            }
            
            showSuccessToast(
                '🎉 Inbox Cleared!', 
                `${unreadCount} message${unreadCount > 1 ? 's' : ''} marked as read. Great job staying organized!`
            );
            
        } catch (error) {
            console.error('❌ Operation error:', error);
            showSuccessToast(
                '❌ Operation Failed', 
                'Could not mark messages as read. Error: ' + error.message
            );
        } finally {
            markAllReadBtn.innerHTML = originalHTML;
            markAllReadBtn.disabled = false;
        }
        
    } catch (error) {
        console.error('❌ Function error:', error);
        showSuccessToast('❌ Error', 'An error occurred: ' + error.message);
    }
}


// ============================================
// DELETE MESSAGE - FIXED VERSION
// ============================================
async function deleteMessage(id) {
    console.log('🗑️ deleteMessage called for:', id);
    
    try {
        // Use custom confirmation modal
        const confirmed = await showConfirmModal(
            '🗑️ Delete Message?',
            'This action cannot be undone. The message will be permanently deleted from your database.'
        );
        
        console.log('Delete confirmation result:', confirmed);
        
        if (!confirmed) {
            console.log('❌ User cancelled deletion');
            return;
        }
        
        console.log('✅ User confirmed deletion');
        
        // Show loading state
        const deleteBtn = document.querySelector(`[data-id="${id}"].delete-btn`);
        if (deleteBtn) {
            deleteBtn.disabled = true;
            deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        }
        
        try {
            if (!window.firebaseDb || !window.firebaseModules) {
                throw new Error('Firebase not initialized');
            }
            
            const { doc, deleteDoc } = window.firebaseModules;
            
            console.log('🔄 Deleting document...');
            await deleteDoc(doc(window.firebaseDb, 'messages', id));
            console.log('✅ Document deleted from Firebase');
            
            // Reload messages and analytics
            if (typeof loadMessages === 'function') {
                await loadMessages();
                console.log('✅ Messages reloaded');
            }
            if (typeof loadAnalytics === 'function') {
                await loadAnalytics();
                console.log('✅ Analytics reloaded');
            }
            
            showSuccessToast(
                '🗑️ Message Deleted', 
                'The message has been permanently removed from your inbox.'
            );
            
        } catch (error) {
            console.error('❌ Error deleting message:', error);
            showSuccessToast(
                '❌ Deletion Failed', 
                'Unable to delete the message. Error: ' + error.message
            );
        }
        
    } catch (error) {
        console.error('❌ Error in deleteMessage:', error);
        showSuccessToast('❌ Error', 'An error occurred: ' + error.message);
    }
}

// Make functions globally available
window.markAllMessagesAsRead = markAllMessagesAsRead;
window.deleteMessage = deleteMessage;

// Attach listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOM loaded, attaching listeners...');
    
    const markAllReadBtn = document.getElementById('markAllRead');
    if (markAllReadBtn) {
        // Remove any existing listeners
        markAllReadBtn.replaceWith(markAllReadBtn.cloneNode(true));
        const newMarkAllReadBtn = document.getElementById('markAllRead');
        
        newMarkAllReadBtn.addEventListener('click', markAllMessagesAsRead);
        console.log('✅ Mark All Read listener attached');
    } else {
        console.warn('⚠️ markAllRead button not found on page load');
    }
});

// Backup function to attach listener when admin panel opens
window.attachMarkAllReadListener = function() {
    const btn = document.getElementById('markAllRead');
    if (!btn) {
        console.warn('⚠️ Button not found');
        return;
    }
    
    if (btn.hasAttribute('data-listener-attached')) {
        console.log('ℹ️ Listener already attached');
        return;
    }
    
    btn.addEventListener('click', markAllMessagesAsRead);
    btn.setAttribute('data-listener-attached', 'true');
    console.log('✅ Mark All Read listener attached (backup)');
};

console.log('✅ Fixed modal script loaded');
// ============================================
// REFRESH MESSAGES
// ============================================
const refreshMessagesBtn = document.getElementById('refreshMessages');
if (refreshMessagesBtn) {
    refreshMessagesBtn.addEventListener('click', async () => {
        refreshMessagesBtn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Refreshing...';
        refreshMessagesBtn.disabled = true;
        
        await loadMessages();
        
        setTimeout(() => {
            refreshMessagesBtn.innerHTML = '<i class="fas fa-sync"></i> Refresh';
            refreshMessagesBtn.disabled = false;
        }, 500);
    });
}

// ============================================
// GENERATE VISITOR CHART
// ============================================
async function generateVisitorChart() {
    try {
        if (!window.firebaseDb || !window.firebaseModules) return;
        
        const { collection, getDocs } = window.firebaseModules;
        const analyticsSnapshot = await getDocs(collection(window.firebaseDb, 'analytics'));
        
        const last7Days = [];
        const viewsByDate = {};
        
        // Generate last 7 days dates
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toLocaleDateString();
            last7Days.push(dateStr);
            viewsByDate[dateStr] = 0;
        }
        
        // Count views by date
        analyticsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.date && viewsByDate.hasOwnProperty(data.date)) {
                viewsByDate[data.date]++;
            }
        });
        
        const chartData = last7Days.map(date => viewsByDate[date]);
        
        const ctx = document.getElementById('visitorChart');
        if (!ctx) {
            console.warn('⚠️ visitorChart canvas element not found');
            return;
        }
        
        // ✅ FIX: Properly destroy existing chart if it exists
        if (window.visitorChart && typeof window.visitorChart.destroy === 'function') {
            window.visitorChart.destroy();
        }
        
        // Create new chart
        window.visitorChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: last7Days,
                datasets: [{
                    label: 'Page Views',
                    data: chartData,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#6366f1',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        cornerRadius: 8,
                        titleColor: '#fff',
                        bodyColor: '#fff'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            color: '#8b92a7'
                        },
                        grid: {
                            color: 'rgba(139, 146, 167, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#8b92a7'
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
        
        console.log('✅ Visitor chart generated successfully');
        
    } catch (error) {
        console.error('❌ Error generating visitor chart:', error);
    }
}
// ============================================
// MESSAGE CATEGORIES CHART
// ============================================
async function generateMessageCategoryChart() {
    try {
        if (!window.firebaseDb || !window.firebaseModules) return;
        
        const { collection, getDocs } = window.firebaseModules;
        const messagesSnapshot = await getDocs(collection(window.firebaseDb, 'messages'));
        
        // Count messages by category
        const categoryCounts = {
            'Job Inquiry': 0,
            'Collaboration': 0,
            'Technical Question': 0,
            'Feedback': 0,
            'General': 0
        };
        
        messagesSnapshot.forEach(doc => {
            const data = doc.data();
            const category = data.category || 'General';
            if (categoryCounts.hasOwnProperty(category)) {
                categoryCounts[category]++;
            } else {
                categoryCounts['General']++;
            }
        });
        
        const ctx = document.getElementById('messageTypeChart');
        if (!ctx) {
            console.warn('⚠️ messageTypeChart canvas element not found');
            return;
        }
        
        // ✅ FIX: Properly destroy existing chart if it exists
        if (window.messageCategoryChart && typeof window.messageCategoryChart.destroy === 'function') {
            window.messageCategoryChart.destroy();
        }
        
        // Create doughnut chart
        window.messageCategoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(categoryCounts),
                datasets: [{
                    data: Object.values(categoryCounts),
                    backgroundColor: [
                        '#6366f1', // Job Inquiry - Blue
                        '#8b5cf6', // Collaboration - Purple
                        '#ec4899', // Technical Question - Pink
                        '#10b981', // Feedback - Green
                        '#f59e0b'  // General - Orange
                    ],
                    borderWidth: 3,
                    borderColor: 'var(--bg)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: {
                                size: 12,
                                family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                            },
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        },
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        cornerRadius: 8
                    }
                },
                cutout: '60%'
            }
        });
        
        console.log('✅ Message category chart generated');
        
    } catch (error) {
        console.error('❌ Error generating category chart:', error);
    }
}
// ============================================
// UPDATE LOAD ANALYTICS TO INCLUDE CHART
// ============================================
async function loadAnalytics() {
    try {
        if (!window.firebaseDb || !window.firebaseModules) return;
        
        const { collection, getDocs, query, where, Timestamp } = window.firebaseModules;
        
        // Total views
        const analyticsSnapshot = await getDocs(collection(window.firebaseDb, 'analytics'));
        const totalViews = analyticsSnapshot.size;
        
        // Total messages
        const messagesSnapshot = await getDocs(collection(window.firebaseDb, 'messages'));
        const totalMessages = messagesSnapshot.size;
        
        // Unread messages
        const unreadQuery = query(collection(window.firebaseDb, 'messages'), where('read', '==', false));
        const unreadSnapshot = await getDocs(unreadQuery);
        const unreadMessages = unreadSnapshot.size;
        
        // Today's views
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = Timestamp.fromDate(today);
        
        const todayQuery = query(
            collection(window.firebaseDb, 'analytics'),
            where('timestamp', '>=', todayTimestamp)
        );
        const todaySnapshot = await getDocs(todayQuery);
        const todayViews = todaySnapshot.size;
        
        // Update UI
        const totalViewsEl = document.getElementById('totalViews');
        const totalMessagesEl = document.getElementById('totalMessages');
        const todayViewsEl = document.getElementById('todayViews');
        const unreadMessagesEl = document.getElementById('unreadMessages');
        
        if (totalViewsEl) totalViewsEl.textContent = totalViews;
        if (totalMessagesEl) totalMessagesEl.textContent = totalMessages;
        if (todayViewsEl) todayViewsEl.textContent = todayViews;
        if (unreadMessagesEl) unreadMessagesEl.textContent = unreadMessages;
        
        // Generate charts
        await generateVisitorChart();
        await generateMessageCategoryChart(); // ✅ Generate category chart
        
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

// Make functions globally available
window.loadMessages = loadMessages;
window.markAsRead = markAsRead;
window.deleteMessage = deleteMessage;
window.categorizeMessage = categorizeMessage;
window.generateMessageCategoryChart = generateMessageCategoryChart;
window.generateVisitorChart = generateVisitorChart; // ✅ ADD THIS LINE
// ============================================
// EXPORT FUNCTIONS
// ============================================
const exportExcelBtn = document.getElementById('exportExcel');
if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', async () => {
        await exportMessages('csv');
    });
}

const exportCSVBtn = document.getElementById('exportCSV');
if (exportCSVBtn) {
    exportCSVBtn.addEventListener('click', async () => {
        await exportMessages('csv');
    });
}

const exportJSONBtn = document.getElementById('exportJSON');
if (exportJSONBtn) {
    exportJSONBtn.addEventListener('click', async () => {
        await exportMessages('json');
    });
}

async function exportMessages(format) {
    try {
        let messages = [];
        
        if (window.firebaseDb && window.firebaseModules) {
            const { collection, getDocs } = window.firebaseModules;
            const querySnapshot = await getDocs(collection(window.firebaseDb, 'messages'));
            querySnapshot.forEach((doc) => {
                messages.push(doc.data());
            });
        }
        
        if (format === 'csv') {
            const csv = convertToCSV(messages);
            downloadFile(csv, 'contact-messages.csv', 'text/csv');
        } else if (format === 'json') {
            const json = JSON.stringify(messages, null, 2);
            downloadFile(json, 'contact-messages.json', 'application/json');
        }
        
        showSuccessToast('Exported!', `Data exported as ${format.toUpperCase()} successfully.`);
    } catch (error) {
        console.error('Error exporting messages:', error);
        showSuccessToast('Error!', 'Failed to export data.');
    }
}

function convertToCSV(data) {
    const headers = ['Name', 'Email', 'Message', 'Date', 'Read'];
    const rows = data.map(msg => [
        msg.name,
        msg.email,
        msg.message.replace(/,/g, ';'),
        msg.date || new Date(msg.timestamp).toLocaleString(),
        msg.read ? 'Yes' : 'No'
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// GOOGLE SHEETS SYNC
// ============================================
// ============================================
// AUTO-SYNC TOGGLE (FIXED)
// ============================================
let autoSyncInterval = null;

const autoSyncToggle = document.getElementById('autoSyncToggle');
if (autoSyncToggle) {
    // Check if auto-sync was previously enabled
    const autoSyncEnabled = localStorage.getItem('autoSyncEnabled') === 'true';
    if (autoSyncEnabled) {
        autoSyncToggle.checked = true;
        startAutoSync();
    }
    
    autoSyncToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            startAutoSync();
            localStorage.setItem('autoSyncEnabled', 'true');
            showSuccessToast(
                '🔄 Auto-Sync Enabled', 
                'Your messages will automatically backup to Google Sheets every 30 minutes!'
            );
        } else {
            stopAutoSync();
            localStorage.setItem('autoSyncEnabled', 'false');
            showSuccessToast(
                '⏸️ Auto-Sync Paused', 
                'Automatic syncing is now disabled. You can still sync manually anytime.'
            );
        }
    });
}
// ============================================
// SYNC NOW BUTTON (FIXED)
// ============================================
const syncNowBtn = document.getElementById('syncNowBtn');
if (syncNowBtn) {
    syncNowBtn.addEventListener('click', async () => {
        const btnText = syncNowBtn.innerHTML;
        syncNowBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        syncNowBtn.disabled = true;
        
        try {
            await syncToGoogleSheets();
        } catch (error) {
            console.error('Sync button error:', error);
            if (typeof showSuccessToast === 'function') {
                showSuccessToast(
                    '❌ Sync Failed', 
                    'Could not sync to Google Sheets. Please try again.'
                );
            }
        } finally {
            syncNowBtn.innerHTML = btnText;
            syncNowBtn.disabled = false;
        }
    });
}

function startAutoSync() {
    if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
    }
    autoSyncInterval = setInterval(async () => {
        console.log('🔄 Auto-sync running...');
        await syncToGoogleSheets();
    }, 30 * 60 * 1000); // 30 minutes
    console.log('✅ Auto-sync started');
}

function stopAutoSync() {
    if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
        autoSyncInterval = null;
        console.log('⏸️ Auto-sync stopped');
    }
}

// Make functions globally available
window.startAutoSync = startAutoSync;
window.stopAutoSync = stopAutoSync;

async function syncToGoogleSheets() {
    const syncStatus = document.getElementById('syncStatus');
    const lastSync = document.getElementById('lastSync');
    const syncBtn = document.getElementById('syncNowBtn');
    
    if (syncStatus) {
        syncStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        syncStatus.style.color = '#f59e0b';
    }
    if (syncBtn) {
        syncBtn.disabled = true;
    }
    
    try {
        let messages = [];
        
        if (window.firebaseDb && window.firebaseModules) {
            const { collection, getDocs, query, orderBy } = window.firebaseModules;
            const q = query(collection(window.firebaseDb, 'messages'), orderBy('timestamp', 'desc'));
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                messages.push({
                    name: data.name,
                    email: data.email,
                    message: data.message,
                    date: data.date || new Date(data.timestamp).toLocaleString(),
                    read: data.read ? 'Yes' : 'No'
                });
            });
        }
        
        if (messages.length === 0) {
            showSuccessToast('No Data', 'No messages to sync.');
            if (syncStatus) {
                syncStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> No data';
                syncStatus.style.color = '#f59e0b';
            }
            if (syncBtn) {
                syncBtn.disabled = false;
            }
            return;
        }
        
        await fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({ data: messages })
        });
        
        if (syncStatus) {
            syncStatus.innerHTML = '<i class="fas fa-check-circle"></i> Synced successfully';
            syncStatus.style.color = '#10b981';
        }
        
        const now = new Date().toLocaleString();
        if (lastSync) {
            lastSync.textContent = `Last synced: ${now}`;
        }
        localStorage.setItem('lastSyncTime', now);
        
        showSuccessToast('Synced!', `${messages.length} messages synced successfully.`);
        
    } catch (error) {
        console.error('Error syncing to Google Sheets:', error);
        if (syncStatus) {
            syncStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> Sync failed';
            syncStatus.style.color = '#ef4444';
        }
        showSuccessToast('Sync Failed', 'Could not sync. Please try again.');
    } finally {
        if (syncBtn) {
            syncBtn.disabled = false;
        }
    }
}

// ============================================
// SCROLL ANIMATIONS
// ============================================
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('.project-card, .timeline-item, .skill-category, .achievement-card, .education-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

const techIcons = document.querySelectorAll('.tech-icon');
techIcons.forEach((icon, index) => {
    icon.style.opacity = '0';
    icon.style.transform = 'scale(0.8)';
    icon.style.transition = `opacity 0.5s ease ${index * 0.1}s, transform 0.5s ease ${index * 0.1}s`;
    observer.observe(icon);
});

// ============================================
// ACTIVE NAV LINK ON SCROLL
// ============================================
const sections = document.querySelectorAll('section[id]');

function activateNavLink() {
    const scrollY = window.pageYOffset;
    
    sections.forEach(section => {
        const sectionHeight = section.offsetHeight;
        const sectionTop = section.offsetTop - 100;
        const sectionId = section.getAttribute('id');
        
        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
            document.querySelectorAll('.nav-links a').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${sectionId}`) {
                    link.classList.add('active');
                }
            });
        }
    });
}

window.addEventListener('scroll', activateNavLink);

const revealSections = document.querySelectorAll('.about, .projects, .experience, .contact');
revealSections.forEach(section => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(30px)';
    section.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
    observer.observe(section);
});

// ============================================
// UTILITY FUNCTIONS
// ============================================
window.viewAllMessages = async function() {
    try {
        let messages = [];
        
        if (window.firebaseDb && window.firebaseModules) {
            const { collection, getDocs } = window.firebaseModules;
            const querySnapshot = await getDocs(collection(window.firebaseDb, 'messages'));
            querySnapshot.forEach((doc) => {
                messages.push({ id: doc.id, ...doc.data() });
            });
        }
        
        if (messages.length === 0) {
            console.log('No messages stored yet.');
            return;
        }
        
        console.log('=== ALL CONTACT MESSAGES ===');
        messages.forEach((msg, index) => {
            console.log(`\nMessage ${index + 1}:`);
            console.log('ID:', msg.id);
            console.log('Name:', msg.name);
            console.log('Email:', msg.email);
            console.log('Message:', msg.message);
            console.log('Date:', msg.date || new Date(msg.timestamp).toLocaleString());
            console.log('Read:', msg.read ? 'Yes' : 'No');
            console.log('---');
        });
        console.log(`\nTotal: ${messages.length} messages`);
    } catch (error) {
        console.error('Error viewing messages:', error);
    }
};

// ============================================
// ADMIN CONTENT LOADER (PLACEHOLDER)
// ============================================
function loadAdminContent() {
    // Load saved admin content if exists
    const savedContent = JSON.parse(localStorage.getItem('adminContent') || '{}');
    if (Object.keys(savedContent).length > 0) {
        const homeHeading = document.getElementById('homeHeading');
        const homeTagline = document.getElementById('homeTagline');
        const aboutP1 = document.getElementById('aboutP1');
        const aboutP2 = document.getElementById('aboutP2');
        const aboutP3 = document.getElementById('aboutP3');
        
        if (savedContent.homeHeading && homeHeading) homeHeading.textContent = savedContent.homeHeading;
        if (savedContent.homeTagline && homeTagline) homeTagline.textContent = savedContent.homeTagline;
        if (savedContent.aboutP1 && aboutP1) aboutP1.textContent = savedContent.aboutP1;
        if (savedContent.aboutP2 && aboutP2) aboutP2.textContent = savedContent.aboutP2;
        if (savedContent.aboutP3 && aboutP3) aboutP3.textContent = savedContent.aboutP3;
    }
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    activateNavLink();
    console.log('🚀 Portfolio loaded successfully!');
    console.log('💡 Admin Access: Triple-click the logo or press Ctrl+Shift+A');
    console.log('📝 Console Commands: viewAllMessages()');
    
    loadAdminContent();
    
    // Check authentication state
    if (window.firebaseAuth && window.firebaseModules) {
        const { onAuthStateChanged } = window.firebaseModules;
        onAuthStateChanged(window.firebaseAuth, (user) => {
            if (user) {
                console.log('✅ User authenticated:', user.email);
            }
        });
    }
    
    // Load last sync time
    const lastSyncTime = localStorage.getItem('lastSyncTime');
    if (lastSyncTime) {
        const lastSyncElement = document.getElementById('lastSync');
        if (lastSyncElement) {
            lastSyncElement.textContent = `Last synced: ${lastSyncTime}`;
        }
    }
});

// ============================================
// DARK MODE PREFERENCE DETECTION
// ============================================
function detectSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        if (!localStorage.getItem('theme')) {
            html.setAttribute('data-theme', 'dark');
            updateThemeIcon('dark');
        }
    }
}

detectSystemTheme();

if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            const newTheme = e.matches ? 'dark' : 'light';
            html.setAttribute('data-theme', newTheme);
            updateThemeIcon(newTheme);
        }
    });
}
// ============================================
// TECH STACK BASED PROJECT FILTERING - SIMPLE & DIRECT
// ============================================

console.log('🚀 Tech filter script loading...');

// Wait for everything to be ready
function waitForProjectsData() {
    return new Promise((resolve) => {
        const checkData = () => {
            if (typeof projectsData !== 'undefined' && Object.keys(projectsData).length > 0) {
                console.log('✅ projectsData found:', projectsData);
                resolve();
            } else {
                console.log('⏳ Waiting for projectsData...');
                setTimeout(checkData, 500);
            }
        };
        checkData();
    });
}

// Extract all unique tech stacks from projects
function getAllTechStacks() {
    const allTechs = new Set();
    
    Object.values(projectsData).forEach(project => {
        if (project.techStack && Array.isArray(project.techStack)) {
            project.techStack.forEach(tech => {
                allTechs.add(tech);
            });
        }
    });
    
    const techArray = Array.from(allTechs).sort();
    console.log('📊 All tech stacks found:', techArray);
    return techArray;
}

// Get important techs to show as filters
function getFilterTechs() {
    const allTechs = getAllTechStacks();
    
    // Priority list - only show these if they exist
    const priorities = [
        'Machine Learning',
        'Flask',
        'Google Gemini API', 
        'OpenCV',
        'JavaScript',
        'Python',
        'NLP',
        'Computer Vision',
        'AI Chatbot',
        'MediaPipe',
        'HTML',
        'CSS'
    ];
    
    const filtered = priorities.filter(tech => allTechs.includes(tech));
    console.log('🎯 Techs to show as filters:', filtered);
    return filtered;
}

// Shorten tech names for display
function shortenTechName(tech) {
    const shortNames = {
        'Google Gemini API': 'Gemini AI',
        'Machine Learning': 'ML',
        'Computer Vision': 'CV',
        'AI Chatbot': 'AI Bot',
        'JavaScript': 'JS'
    };
    return shortNames[tech] || tech;
}

// Generate filter buttons
function generateFilters() {
    console.log('🔧 Generating filter buttons...');
    
    const container = document.querySelector('.project-filters');
    if (!container) {
        console.error('❌ .project-filters not found!');
        return;
    }
    
    // Get techs to display
    const techs = getFilterTechs();
    
    if (techs.length === 0) {
        console.error('❌ No techs found to create filters!');
        return;
    }
    
    // Clear everything
    container.innerHTML = '';
    
    // Create "All" button
    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn active';
    allBtn.setAttribute('data-filter', 'all');
    allBtn.textContent = 'All';
    allBtn.onclick = () => filterProjects('all', allBtn);
    container.appendChild(allBtn);
    
    // Create button for each tech
    techs.forEach(tech => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.setAttribute('data-filter', tech);
        btn.textContent = shortenTechName(tech);
        btn.title = tech; // Full name on hover
        btn.onclick = () => filterProjects(tech, btn);
        container.appendChild(btn);
    });
    
    console.log(`✅ Created ${techs.length + 1} filter buttons`);
}

// Filter projects based on selected tech
function filterProjects(tech, clickedBtn) {
    console.log(`🔍 Filtering by: ${tech}`);
    
    // Update active state
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    }
    
    // Filter project cards
    const cards = document.querySelectorAll('.project-card');
    let visibleCount = 0;
    
    cards.forEach((card, index) => {
        const projectId = card.getAttribute('data-project');
        const project = projectsData[projectId];
        
        if (!project) {
            card.style.display = 'none';
            return;
        }
        
        let shouldShow = false;
        
        if (tech === 'all') {
            shouldShow = true;
        } else if (project.techStack && project.techStack.includes(tech)) {
            shouldShow = true;
        }
        
        if (shouldShow) {
            // Show with animation
            setTimeout(() => {
                card.style.display = 'block';
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
                setTimeout(() => {
                    card.style.transition = 'all 0.4s ease';
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, 10);
            }, index * 50);
            visibleCount++;
        } else {
            // Hide with animation
            card.style.transition = 'all 0.2s ease';
            card.style.opacity = '0';
            setTimeout(() => {
                card.style.display = 'none';
            }, 200);
        }
    });
    
    console.log(`📊 Showing ${visibleCount} projects`);
    
    // Update counter
    setTimeout(() => updateCounter(visibleCount, cards.length), 300);
}

// Update project counter
function updateCounter(visible, total) {
    let counter = document.querySelector('.filter-count');
    
    if (!counter) {
        counter = document.createElement('div');
        counter.className = 'filter-count';
        counter.style.cssText = `
            text-align: center;
            color: var(--text-light);
            font-size: 0.9rem;
            margin: 1.5rem auto 0;
            font-weight: 500;
            transition: opacity 0.3s ease;
        `;
        
        const controls = document.querySelector('.project-controls');
        if (controls) {
            controls.appendChild(counter);
        }
    }
    
    counter.style.opacity = '0';
    setTimeout(() => {
        if (visible === total) {
            counter.textContent = `✨ Showing all ${total} projects`;
        } else {
            counter.textContent = `📊 Showing ${visible} of ${total} projects`;
        }
        counter.style.opacity = '1';
    }, 100);
}

// Enhanced search
function setupSearch() {
    const searchInput = document.getElementById('projectSearch');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        
        // Reset filters to "All"
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-filter') === 'all') {
                btn.classList.add('active');
            }
        });
        
        const cards = document.querySelectorAll('.project-card');
        let visibleCount = 0;
        
        cards.forEach((card, index) => {
            const projectId = card.getAttribute('data-project');
            const project = projectsData[projectId];
            
            if (!project) {
                card.style.display = 'none';
                return;
            }
            
            if (term === '') {
                // Show all
                setTimeout(() => {
                    card.style.display = 'block';
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, index * 30);
                visibleCount++;
                return;
            }
            
            // Search in title, description, and tech stack
            const title = project.title.toLowerCase();
            const desc = project.description.toLowerCase();
            const techs = project.techStack.join(' ').toLowerCase();
            
            if (title.includes(term) || desc.includes(term) || techs.includes(term)) {
                setTimeout(() => {
                    card.style.display = 'block';
                    card.style.opacity = '0';
                    setTimeout(() => {
                        card.style.transition = 'all 0.3s ease';
                        card.style.opacity = '1';
                    }, 10);
                }, index * 50);
                visibleCount++;
            } else {
                card.style.opacity = '0';
                setTimeout(() => {
                    card.style.display = 'none';
                }, 200);
            }
        });
        
        setTimeout(() => updateCounter(visibleCount, cards.length), 250);
    });
    
    console.log('✅ Search enhanced with tech stack filtering');
}

// Tech badges function (disabled - keeping existing design)
function addTechBadges() {
    // Tech badges are already part of your existing HTML design
    // This function is disabled to avoid duplicates
    console.log('ℹ️ Tech badges skipped (using existing HTML design)');
}

// Main initialization
async function init() {
    console.log('🎯 Initializing tech stack filtering...');
    
    try {
        // Wait for projectsData
        await waitForProjectsData();
        
        // Generate filters
        generateFilters();
        
        // Add badges
        addTechBadges();
        
        // Setup search
        setupSearch();
        
        // Initial counter
        const cards = document.querySelectorAll('.project-card');
        updateCounter(cards.length, cards.length);
        
        console.log('✅ Tech stack filtering ready!');
        
    } catch (error) {
        console.error('❌ Initialization failed:', error);
    }
}

// Start when ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const search = document.getElementById('projectSearch');
        if (search) {
            search.focus();
            search.select();
        }
    }
    
    // Alt + 0-9 for filters
    if (e.altKey && e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        const buttons = document.querySelectorAll('.filter-btn');
        const index = parseInt(e.key);
        if (buttons[index]) buttons[index].click();
    }
});

// Make functions global
window.filterProjects = filterProjects;
window.generateFilters = generateFilters;

console.log('✅ Tech filter script loaded');
console.log('⌨️  Shortcuts: Ctrl+K (search), Alt+0-9 (filters)');

// ============================================
// CONSOLE EASTER EGG
// ============================================
console.log('%c👋 Hello Developer!', 'font-size: 20px; font-weight: bold; color: #6366f1;');
console.log('%cInterested in the code? Check out the GitHub repo!', 'font-size: 14px; color: #8b5cf6;');
console.log('%c\nHidden Features:', 'font-size: 16px; font-weight: bold; color: #ec4899;');
console.log('🔐 Triple-click logo for admin access');
console.log('⌨️  Ctrl+Shift+A for quick admin login');
console.log('🎨 System theme auto-detection enabled');
console.log('📱 Responsive design with mobile-first approach');
console.log('🔥 Firebase integration for real-time data');
console.log('📊 Google Sheets integration for data sync');
console.log('\n💡 Try these commands:');
console.log('   - viewAllMessages()');
// Add this at the top of your script.js to verify functions exist
console.log('showConfirmModal available:', typeof showConfirmModal);
console.log('showSuccessToast available:', typeof showSuccessToast);
console.log('loadMessages available:', typeof loadMessages);
console.log('loadAnalytics available:', typeof loadAnalytics);
console.log('syncToGoogleSheets available:', typeof syncToGoogleSheets);