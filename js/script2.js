// ============================================
// NEW FEATURES JAVASCRIPT
// Add this file to your project and include it in HTML:
// <script src="new-features.js"></script>
// ============================================

// ============================================
// PRELOADER
// ============================================
window.addEventListener('load', () => {
    setTimeout(() => {
        const preloader = document.getElementById('preloader');
        if (preloader) {
            preloader.style.opacity = '0';
            setTimeout(() => {
                preloader.style.display = 'none';
            }, 500);
        }
    }, 1000);
});

// ============================================
// PARTICLES.JS CONFIGURATION
// ============================================
if (typeof particlesJS !== 'undefined') {
    particlesJS('particles-js', {
        particles: {
            number: { value: 80, density: { enable: true, value_area: 800 } },
            color: { value: '#6366f1' },
            shape: { type: 'circle' },
            opacity: { value: 0.5, random: false },
            size: { value: 3, random: true },
            line_linked: {
                enable: true,
                distance: 150,
                color: '#6366f1',
                opacity: 0.4,
                width: 1
            },
            move: {
                enable: true,
                speed: 2,
                direction: 'none',
                random: false,
                straight: false,
                out_mode: 'out',
                bounce: false
            }
        },
        interactivity: {
            detect_on: 'canvas',
            events: {
                onhover: { enable: true, mode: 'repulse' },
                onclick: { enable: true, mode: 'push' },
                resize: true
            }
        },
        retina_detect: true
    });
}

// ============================================
// TYPING EFFECT FOR HERO SECTION
// ============================================
const roles = ["ML Developer", "Data Analyst", "Creative Thinker", "Problem Solver", "AI Enthusiast"];
let roleIndex = 0;
let charIndex = 0;
let isDeleting = false;

function typeEffect() {
    const typedElement = document.getElementById('typedText');
    if (!typedElement) return;

    const current = roles[roleIndex];

    if (isDeleting) {
        typedElement.textContent = current.substring(0, charIndex - 1);
        charIndex--;
    } else {
        typedElement.textContent = current.substring(0, charIndex + 1);
        charIndex++;
    }

    if (!isDeleting && charIndex === current.length) {
        isDeleting = true;
        setTimeout(typeEffect, 2000);
    } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        roleIndex = (roleIndex + 1) % roles.length;
        setTimeout(typeEffect, 500);
    } else {
        setTimeout(typeEffect, isDeleting ? 50 : 100);
    }
}

// Start typing effect after page loads
setTimeout(typeEffect, 1500);

// ============================================
// BACK TO TOP BUTTON
// ============================================
const backToTopBtn = document.getElementById('backToTop');

if (backToTopBtn) {
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTopBtn.style.display = 'flex';
        } else {
            backToTopBtn.style.display = 'none';
        }
    });

    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ============================================
// FLOATING CONTACT BUTTON
// ============================================
const floatingContact = document.getElementById('floatingContact');
if (floatingContact) {
    floatingContact.addEventListener('click', () => {
        document.getElementById('contact').scrollIntoView({ behavior: 'smooth' });
    });
}

// ============================================
// SKILL PROGRESS BARS ANIMATION
// ============================================
function animateSkillBars() {
    const skillBars = document.querySelectorAll('.skill-progress');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const progress = entry.target.getAttribute('data-progress');
                entry.target.style.width = progress + '%';
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    skillBars.forEach(bar => {
        bar.style.width = '0%';
        observer.observe(bar);
    });
}

// Initialize skill bars animation
setTimeout(animateSkillBars, 500);

// ============================================
// PROJECT SEARCH FUNCTIONALITY
// ============================================
const projectSearch = document.getElementById('projectSearch');
if (projectSearch) {
    projectSearch.addEventListener('input', function (e) {
        const searchTerm = e.target.value.toLowerCase();

        document.querySelectorAll('.project-card').forEach(card => {
            const title = card.querySelector('h3').textContent.toLowerCase();
            const description = card.querySelector('p').textContent.toLowerCase();

            if (title.includes(searchTerm) || description.includes(searchTerm)) {
                card.style.display = 'block';
                card.style.animation = 'fadeIn 0.3s ease';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// ============================================
// PROJECT FILTERING
// ============================================
document.querySelectorAll('.project-filters .filter-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        const filter = this.getAttribute('data-filter');

        document.querySelectorAll('.project-filters .filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        document.querySelectorAll('.project-card').forEach(card => {
            if (filter === 'all' || card.getAttribute('data-category') === filter) {
                card.style.display = 'block';
                card.style.animation = 'fadeIn 0.3s ease';
            } else {
                card.style.display = 'none';
            }
        });
    });
});




// ============================================
// RATE LIMITING FOR CONTACT FORM
// ============================================
let lastSubmitTime = 0;
const RATE_LIMIT = 60000; // 1 minute

// Override the original contact form submit
const originalContactForm = document.getElementById('contactForm');
if (originalContactForm) {
    originalContactForm.addEventListener('submit', function (e) {
        const now = Date.now();
        if (now - lastSubmitTime < RATE_LIMIT) {
            e.preventDefault();
            e.stopPropagation();
            const remainingTime = Math.ceil((RATE_LIMIT - (now - lastSubmitTime)) / 1000);
            showSuccessToast('Please wait', `You can submit again in ${remainingTime} seconds`);
            return false;
        }
        lastSubmitTime = now;
    }, true); // Use capture phase to run before other handlers
}

// ============================================
// INPUT SANITIZATION
// ============================================
function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

// Make it available globally
window.sanitizeInput = sanitizeInput;

// ============================================
// VISITOR LOCATION TRACKING (ASYNC FUNCTION)
// Replace the existing trackVisitorLocation function in your script2.js
// ============================================

/**
 * Track visitor location and save to Firebase
 * Uses ipapi.co API (HTTPS compatible)
 * Automatically called on page load
 */
async function trackVisitorLocation() {
    try {
        // Respect cookie consent
        if (localStorage.getItem('cookieConsent') !== 'accepted') {
            return;
        }
        // Fetch location data from ipapi.co (HTTPS)
        const response = await fetch('https://ipapi.co/json/');

        // Check if request was successful
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Check for API errors (rate limiting, etc.)
        if (data.error) {
            console.warn('⚠️ Location API error:', data.reason);
            return; // Exit gracefully without breaking the site
        }

        // Validate we got location data
        if (!data.country || !data.ip) {
            console.warn('⚠️ Incomplete location data received');
            return;
        }



        // Save to Firebase if available
        if (window.firebaseDb && window.firebaseModules) {
            const { collection, addDoc, getDocs, query, where, Timestamp } = window.firebaseModules;

            // Check for duplicate IP — skip if already tracked today
            const lastTrackedIP = localStorage.getItem('lastTrackedIP');
            const lastTrackedTime = localStorage.getItem('lastTrackedTime');
            const now = Date.now();
            const ONE_DAY = 24 * 60 * 60 * 1000;

            if (lastTrackedIP === data.ip && lastTrackedTime && (now - parseInt(lastTrackedTime)) < ONE_DAY) {
                // Already tracked this IP within 24 hours, skip
                return;
            }

            // Prepare visitor data
            const visitorData = {
                // Location info
                ip: data.ip || 'Unknown',
                country: data.country || 'Unknown',
                countryName: data.country_name || 'Unknown',
                city: data.city || 'Unknown',
                region: data.region || 'Unknown',
                regionCode: data.region_code || 'Unknown',

                // Additional details
                timezone: data.timezone || 'Unknown',
                postal: data.postal || 'Unknown',
                latitude: data.latitude || null,
                longitude: data.longitude || null,

                // ISP/Network info
                org: data.org || 'Unknown',
                asn: data.asn || 'Unknown',

                // Metadata
                timestamp: Timestamp.now(),
                date: new Date().toLocaleDateString(),
                dateTime: new Date().toLocaleString(),

                // Browser info
                userAgent: navigator.userAgent,
                language: navigator.language,
                platform: navigator.platform,
                screenResolution: `${screen.width}x${screen.height}`,

                // Page info
                referrer: document.referrer || 'Direct',
                currentPage: window.location.pathname
            };

            // Save to visitors collection
            await addDoc(collection(window.firebaseDb, 'visitors'), visitorData);

            // Also save to analytics collection (used by admin panel for total views)
            await addDoc(collection(window.firebaseDb, 'analytics'), {
                type: 'page_view',
                ip: data.ip || 'Unknown',
                country: data.country_name || 'Unknown',
                city: data.city || 'Unknown',
                timestamp: Timestamp.now(),
                date: new Date().toLocaleDateString()
            });

            // Mark as tracked to prevent duplicates
            localStorage.setItem('lastTrackedIP', data.ip);
            localStorage.setItem('lastTrackedTime', now.toString());



        } else {

        }

    } catch (error) {
        // Log error but don't break the site
        // Silently fail - don't break the site

        // If it's a network error, provide helpful info
        if (error.message.includes('Failed to fetch')) {
        }
    }
}

// ============================================
// AUTO-TRACK ON PAGE LOAD
// ============================================

/**
 * Initialize location tracking when page loads
 * Waits 3 seconds to not slow down initial page load
 */
window.addEventListener('load', () => {
    // Delay tracking to prioritize page load performance
    setTimeout(() => {
        trackVisitorLocation();
    }, 3000); // 3 second delay
});

// ============================================
// MANUAL TRACKING FUNCTION (for testing)
// ============================================

/**
 * Test location tracking manually
 * Call this in console to test: testLocationTracking()
 */
window.testLocationTracking = async function () {
    console.log('\n%c🧪 MANUAL LOCATION TRACKING TEST', 'font-size: 16px; font-weight: bold; color: #10b981; background: #dcfce7; padding: 10px;');
    console.log('====================================\n');

    try {
        // Step 1: Fetch location
        console.log('1️⃣ Fetching location data...');
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();

        if (data.error) {
            console.error('❌ API Error:', data.reason);
            console.log('\n💡 This usually means:');
            console.log('   - Rate limit exceeded (30k/month on free tier)');
            console.log('   - Try again in a few minutes');
            return;
        }

        console.log('✅ Location data received!\n');

        // Display in table format
        console.table({
            'IP Address': data.ip,
            'Country': data.country_name,
            'City': data.city,
            'Region': data.region,
            'Postal Code': data.postal,
            'Timezone': data.timezone,
            'ISP/Org': data.org,
            'Coordinates': `${data.latitude}, ${data.longitude}`
        });

        // Step 2: Save to Firebase
        if (window.firebaseDb && window.firebaseModules) {
            console.log('\n2️⃣ Saving to Firebase...');

            const { collection, addDoc, Timestamp } = window.firebaseModules;

            const docRef = await addDoc(collection(window.firebaseDb, 'visitors'), {
                ip: data.ip,
                country: data.country,
                countryName: data.country_name,
                city: data.city,
                region: data.region,
                timezone: data.timezone,
                org: data.org,
                timestamp: Timestamp.now(),
                date: new Date().toLocaleDateString(),
                testMode: true // Mark as test
            });

            console.log('✅ Saved to Firebase!');
            console.log('   Document ID:', docRef.id);
            console.log('   Collection: visitors');
            console.log('\n🔗 Check your Firebase Console to see the data');

        } else {
            console.warn('⚠️ Firebase not available - data not saved');
        }

        console.log('\n%c✅ TEST COMPLETE!', 'font-size: 14px; font-weight: bold; color: #166534; background: #dcfce7; padding: 8px;');

    } catch (error) {
        console.error('\n%c❌ TEST FAILED!', 'font-size: 14px; font-weight: bold; color: #991b1b; background: #fee2e2; padding: 8px;');
        console.error('Error:', error.message);

        if (error.message.includes('Failed to fetch')) {
            console.log('\n💡 Troubleshooting:');
            console.log('   1. Check your internet connection');
            console.log('   2. Make sure you\'re not being rate limited');
            console.log('   3. Try disabling ad blockers');
            console.log('   4. Wait a few minutes and try again');
        }
    }
};

// ============================================
// ALTERNATIVE: FALLBACK TO DIFFERENT API
// ============================================

/**
 * Fallback function if ipapi.co fails
 * Uses ipwhois.app as backup
 */
async function trackVisitorLocationFallback() {
    try {
        console.log('🔄 Using fallback location API (ipwhois.app)...');

        // Step 1: Get IP from ipify
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        const userIP = ipData.ip;

        console.log('   Got IP:', userIP);

        // Step 2: Get location from IP
        const locationResponse = await fetch(`https://ipwhois.app/json/${userIP}`);
        const data = await locationResponse.json();

        if (data.success === false) {
            throw new Error('Location lookup failed');
        }

        console.log('✅ Fallback location data fetched:', data.city, data.country);

        // Save to Firebase
        if (window.firebaseDb && window.firebaseModules) {
            const { collection, addDoc, Timestamp } = window.firebaseModules;

            await addDoc(collection(window.firebaseDb, 'visitors'), {
                ip: data.ip,
                country: data.country_code,
                countryName: data.country,
                city: data.city,
                region: data.region,
                timezone: data.timezone,
                org: data.org,
                timestamp: Timestamp.now(),
                date: new Date().toLocaleDateString(),
                api: 'ipwhois.app' // Mark which API was used
            });

            console.log('✅ Visitor tracked (fallback API)');
        }

    } catch (error) {
        console.log('⚠️ Fallback tracking also failed:', error.message);
    }
}

// Make functions globally available
window.trackVisitorLocation = trackVisitorLocation;
window.trackVisitorLocationFallback = trackVisitorLocationFallback;


// ============================================
// TIMELINE ANIMATION
// ============================================
const timelineItems = document.querySelectorAll('.timeline-item, .education-item');
const timelineObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateX(0)';
        }
    });
}, { threshold: 0.3 });

timelineItems.forEach(item => {
    item.style.opacity = '0';
    item.style.transform = 'translateX(-50px)';
    item.style.transition = 'all 0.6s ease';
    timelineObserver.observe(item);
});

// ============================================
// TOOLTIP FUNCTIONALITY
// ============================================
document.querySelectorAll('[data-tooltip]').forEach(element => {
    element.addEventListener('mouseenter', function () {
        const tooltip = document.createElement('div');
        tooltip.className = 'custom-tooltip';
        tooltip.textContent = this.getAttribute('data-tooltip');
        document.body.appendChild(tooltip);

        const rect = this.getBoundingClientRect();
        tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
        tooltip.style.top = rect.top - tooltip.offsetHeight - 10 + 'px';

        this._tooltip = tooltip;
    });

    element.addEventListener('mouseleave', function () {
        if (this._tooltip) {
            this._tooltip.remove();
            delete this._tooltip;
        }
    });
});

// ============================================
// LAZY LOADING FOR IMAGES
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const lazyImages = document.querySelectorAll('img[loading="lazy"]');

    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.classList.remove('lazy-load');
                    }
                    observer.unobserve(img);
                }
            });
        });

        lazyImages.forEach(img => imageObserver.observe(img));
    }
});

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    // Ctrl + / : Focus search
    if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        const searchInput = document.getElementById('projectSearch');
        if (searchInput) searchInput.focus();
    }

    // Arrow keys for project navigation in modal
    const projectModal = document.getElementById('projectModal');
    if (projectModal && projectModal.classList.contains('active')) {
        if (e.key === 'ArrowLeft') {
            // Previous project logic here
        }
        if (e.key === 'ArrowRight') {
            // Next project logic here
        }
    }
});

// ============================================
// SMOOTH REVEAL ANIMATIONS
// ============================================
const revealElements = document.querySelectorAll('.testimonial-card, .achievement-card');
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
            setTimeout(() => {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }, index * 100);
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.1 });

revealElements.forEach(element => {
    element.style.opacity = '0';
    element.style.transform = 'translateY(30px)';
    element.style.transition = 'all 0.6s ease';
    revealObserver.observe(element);
});

// ============================================
// CONSOLE EASTER EGG
// ============================================
console.log('%c👋 Hello Developer!', 'font-size: 20px; font-weight: bold; color: #6366f1;');
console.log('%cInterested in the code? Check out the GitHub repo!', 'font-size: 14px; color: #8b5cf6;');
console.log('%c\n🚀 Hidden Features:', 'font-size: 16px; font-weight: bold; color: #ec4899;');
console.log('🔐 Triple-click logo for admin access');
console.log('⌨️  Ctrl+Shift+A for quick admin login');
console.log('🎨 System theme auto-detection enabled');
console.log('📱 Responsive design with mobile-first approach');
console.log('🔥 Firebase integration for real-time data');
console.log('📊 Google Sheets integration for data sync');
console.log('🔍 Ctrl+/ to focus search');
console.log('\n💡 Try these commands:');
console.log('   - viewAllMessages()');
console.log('   - trackProjectView(projectId)');
console.log('   - likeProject(projectId)');

// ============================================
// PERFORMANCE MONITORING
// ============================================
if (window.performance && window.PerformanceNavigationTiming) {
    window.addEventListener('load', () => {
        setTimeout(() => {
            const [entry] = performance.getEntriesByType('navigation');
            if (entry) {
                const pageLoadTime = Math.round(entry.loadEventEnd - entry.startTime);
                console.log(`Page loaded in ${pageLoadTime}ms`);
            }
        }, 0);
    });
}

// ============================================
// DARK MODE AUTO-DETECTION
// ============================================
function detectSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        if (!localStorage.getItem('theme')) {
            document.documentElement.setAttribute('data-theme', 'dark');
            const icon = document.querySelector('#themeToggle i');
            if (icon) {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            }
        }
    }
}

detectSystemTheme();

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
        const newTheme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        const icon = document.querySelector('#themeToggle i');
        if (icon) {
            if (newTheme === 'dark') {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            } else {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
            }
        }
    }
});


// ============================================
// #12 — PAGE LOAD PROGRESS BAR
// ============================================
(function () {
    const bar = document.getElementById('pageProgress');
    if (!bar) return;

    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 15 + 5;
        if (progress > 90) progress = 90;
        bar.style.width = progress + '%';
    }, 200);

    window.addEventListener('load', () => {
        clearInterval(interval);
        bar.style.width = '100%';
        setTimeout(() => bar.classList.add('done'), 300);
        setTimeout(() => { bar.style.display = 'none'; }, 800);
    });
})();

// ============================================
// #13 — SCROLL PROGRESS INDICATOR
// ============================================
(function () {
    const bar = document.getElementById('scrollProgress');
    if (!bar) return;

    window.addEventListener('scroll', () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        bar.style.width = scrollPercent + '%';
    }, { passive: true });
})();

// ============================================
// #11 — CUSTOM CURSOR
// ============================================
(function () {
    // Only on devices with fine pointer (mouse)
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const cursor = document.getElementById('customCursor');
    const follower = document.getElementById('customCursorFollower');
    if (!cursor || !follower) return;

    let mouseX = 0, mouseY = 0;
    let followerX = 0, followerY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        cursor.style.left = mouseX + 'px';
        cursor.style.top = mouseY + 'px';
    });

    // Smooth follower with requestAnimationFrame
    function animateFollower() {
        followerX += (mouseX - followerX) * 0.15;
        followerY += (mouseY - followerY) * 0.15;
        follower.style.left = followerX + 'px';
        follower.style.top = followerY + 'px';
        requestAnimationFrame(animateFollower);
    }
    animateFollower();

    // Hover effect on interactive elements
    const hoverTargets = 'a, button, input, textarea, .btn, .filter-btn, .project-card, .theme-toggle, .cert-link, .social-links a, .nav-links a';

    document.addEventListener('mouseover', (e) => {
        if (e.target.closest(hoverTargets)) {
            cursor.classList.add('hovering');
            follower.classList.add('hovering');
        }
    });

    document.addEventListener('mouseout', (e) => {
        if (e.target.closest(hoverTargets)) {
            cursor.classList.remove('hovering');
            follower.classList.remove('hovering');
        }
    });

    // Hide when mouse leaves window
    document.addEventListener('mouseleave', () => {
        cursor.style.opacity = '0';
        follower.style.opacity = '0';
    });
    document.addEventListener('mouseenter', () => {
        cursor.style.opacity = '1';
        follower.style.opacity = '0.5';
    });
})();

// ============================================
// #1 — ANIMATED STATS COUNTER
// ============================================
(function () {
    const counters = document.querySelectorAll('.stat-number');
    if (counters.length === 0) return;

    let animated = false;

    function animateCounters() {
        if (animated) return;
        animated = true;

        counters.forEach(counter => {
            const target = parseInt(counter.getAttribute('data-target'));
            const duration = 1500; // ms
            const startTime = performance.now();

            function updateCount(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                // Ease out cubic
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = Math.round(eased * target);
                counter.textContent = current;

                if (progress < 1) {
                    requestAnimationFrame(updateCount);
                } else {
                    counter.textContent = target;
                }
            }
            requestAnimationFrame(updateCount);
        });
    }

    // Trigger when stats section scrolls into view
    const statsSection = document.querySelector('.stats-counter');
    if (statsSection) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateCounters();
                    observer.disconnect();
                }
            });
        }, { threshold: 0.3 });
        observer.observe(statsSection);
    }
})();

// ============================================
// #6 — RESUME DOWNLOAD ANALYTICS
// ============================================
(function () {
    const resumeBtn = document.getElementById('viewResumeBtn');
    if (!resumeBtn) return;

    resumeBtn.addEventListener('click', async () => {
        try {
            if (localStorage.getItem('cookieConsent') !== 'accepted') return;
            if (window.firebaseDb && window.firebaseModules) {
                const { collection, addDoc, Timestamp } = window.firebaseModules;
                await addDoc(collection(window.firebaseDb, 'analytics'), {
                    type: 'resume_download',
                    timestamp: Timestamp.now(),
                    date: new Date().toLocaleDateString()
                });
            }
        } catch (e) {
            // Silent fail
        }
    });
})();

// ============================================
// #15 — VISITOR COUNT BADGE
// ============================================
(function () {
    const badge = document.getElementById('visitorCount');
    if (!badge) return;

    async function loadVisitorCount() {
        try {
            if (window.firebaseDb && window.firebaseModules) {
                const { collection, getDocs } = window.firebaseModules;
                // Read from 'analytics' collection (same as admin panel total views)
                const snapshot = await getDocs(collection(window.firebaseDb, 'analytics'));
                const totalViews = snapshot.size;
                badge.textContent = totalViews.toLocaleString();
            }
        } catch (e) {
            badge.textContent = '0';
        }
    }

    // Wait for Firebase to initialize
    const checkFirebase = setInterval(() => {
        if (window.firebaseDb && window.firebaseModules) {
            clearInterval(checkFirebase);
            loadVisitorCount();
        }
    }, 500);

    // Clear after 15 seconds if Firebase never loads
    setTimeout(() => clearInterval(checkFirebase), 15000);
})();

