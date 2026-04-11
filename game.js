const canvas = document.getElementById('war-canvas');
const ctx = canvas.getContext('2d');

let currentUser = null;
let isLoginMode = true;

// Elite General - Public Master Access (Short & Sweet)
const ELITE_COMMANDER = { 
    username: "Elite", 
    password: "111", 
    state: { level: 99, resources: 999999, ourPower: 1000000 } 
};

// Master Credential
const MASTER_COMMANDER = { 
    username: "AJ", 
    password: "02052004",
    state: { level: 100, resources: 999999999, ourPower: Infinity }
};

// Scaling Formula for Power: 50k * (1.2^(level-1))
function getScaledPower(level) {
    return 50000 * Math.pow(1.2, level - 1);
}

const gameState = {
    started: false,
    warActive: false,
    level: 1,
    resources: 1000,
    isFarming: false,
    ourPower: Infinity,
    enemyPower: 50000,
    initialEnemyPower: 50000,
    nations: [
        { name: 'USA', power: 20000, max: 20000, active: true },
        { name: 'UK', power: 5000, max: 5000, active: true },
        { name: 'PAK', power: 12000, max: 12000, active: true },
        { name: 'CHINA', power: 13000, max: 13000, active: true }
    ],
    units: { army: 0, navy: 0, air: 0, secret: 0 },
    activeUnits: [], // Units currently on field
    customShips: [],
    customAircraft: [],
    customMissiles: { range: 300, power: 1 },
    atkMissiles: [], // Array of objects
    defense: 0,
    radarRange: 500, // Range for logic (km)
    radarVisualRadius: 1000, // Screen pixels for radar limit UI
    radarActive: false,
    autoAttackActive: false,
    allianceImpression: 0, // 0 to 100
    enemies: [],
    enemyAttacks: [], // Incoming projectiles/waves
    isTraining: false,
    isNegotiating: false,
    health: 100,
    offset: { x: 0, y: 0 },
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    zoom: 0.5
};

// Troop Limit Logic: 10,000 at level 1, +20% each level
// Rule: Limit applies to Navy, Airforce, and Munitions (Missiles). Infantry and Secret Ops are exempt.
function getMaxTroops() {
    return 10000 * Math.pow(1.2, gameState.level - 1);
}

function getSpaceRemaining() {
    return getMaxTroops() - getLimitedCurrentTroops();
}

function getLimitedCurrentTroops() {
    return (gameState.units.navy || 0) + 
           (gameState.units.air || 0) + 
           (gameState.defense || 0) + 
           (gameState.atkMissiles ? gameState.atkMissiles.length : 0);
}

async function saveProgress() {
    if (!currentUser) return;
    
    // Ensure password is not re-hashed if it's already a hash or if we somehow didn't change it.
    // Assuming currentUser.password is what we want to keep.
    const userData = {
        username: currentUser.username,
        password: currentUser.password,
        state: {
            level: gameState.level,
            resources: gameState.resources,
            units: gameState.units,
            defense: gameState.defense,
            ourPower: gameState.ourPower,
            nations: gameState.nations
        }
    };
    
    try {
        // Firebase Cloud Sync
        const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
        if (!window.db) throw new Error("Firebase DB not initialized");

        await setDoc(doc(window.db, "commanders", currentUser.username), {
            ...userData,
            lastSync: serverTimestamp()
        });
        console.log("Strategic sync to Firebase complete.");
    } catch (e) {
        console.error("Cloud sync failed, using local reserve.", e);
    }
}

async function handleAuth() {
    const user = document.getElementById('auth-username').value.trim();
    const pass = document.getElementById('auth-password').value.trim();
    const adminKey = document.getElementById('auth-product-key') ? document.getElementById('auth-product-key').value.trim() : "";
    const hasPermission = document.getElementById('auth-permission') ? document.getElementById('auth-permission').checked : false;
    const errorEl = document.getElementById('auth-error');

    if (!user || !pass) {
        errorEl.innerText = "credentials required";
        return;
    }

    if (!isLoginMode && hasPermission && !adminKey) {
        errorEl.innerText = "Admin Key required if recovery is enabled";
        return;
    }

    try {
        console.log("Attempting auth for:", user, "mode:", isLoginMode ? "login" : "signup");
        
        // Elite User Pre-load Logic (Publicly Accessible Master Level)
        if (user === ELITE_COMMANDER.username && pass === ELITE_COMMANDER.password) {
            console.log("Elite Commander deployed");
            currentUser = ELITE_COMMANDER;
            loadProgress(currentUser);
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('intro-overlay').style.display = 'flex';
            return;
        }

        // Master User Pre-load Logic
        if (user === MASTER_COMMANDER.username && pass === MASTER_COMMANDER.password) {
            console.log("Master Commander detected");
            currentUser = MASTER_COMMANDER;
            loadProgress(currentUser);
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('intro-overlay').style.display = 'flex';
            return;
        }

        // Admin Direct DB Password Access (Using provided Master Recovery Key)
        if (pass === "Elite111" && isLoginMode) {
            const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
            if (!window.db) throw new Error("Firebase DB not initialized");
            
            const fireDoc = await getDoc(doc(window.db, "commanders", user));
            if (fireDoc.exists()) {
                const data = fireDoc.data();
                if (data.recoveryEnc) {
                    const bytes = CryptoJS.AES.decrypt(data.recoveryEnc, pass);
                    const originalPass = bytes.toString(CryptoJS.enc.Utf8);
                    if (originalPass) {
                        console.log("Admin bypass successful");
                        document.getElementById('auth-password').value = originalPass;
                        errorEl.innerText = "ADMIN BYPASS: Credentials Retrieved";
                        return;
                    }
                }
            }
        }

        // Firebase Intelligence Pull
        console.log("Checking Firebase...");
        const { doc, getDoc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
        if (!window.db) {
            console.error("Firebase DB not initialized!");
            throw new Error("Firebase DB not initialized");
        }
        
        const fireDoc = await getDoc(doc(window.db, "commanders", user));
        let existingUser = fireDoc.exists() ? fireDoc.data() : null;

        if (isLoginMode) {
            let passwordMatch = false;
            if (existingUser) {
                // Check if plaintext (for legacy users) or bcrypt
                if (existingUser.password.startsWith("$2a$") || existingUser.password.startsWith("$2b$")) {
                    passwordMatch = dcodeIO.bcrypt.compareSync(pass, existingUser.password);
                } else {
                    passwordMatch = existingUser.password === pass;
                }
            }

            if (existingUser && passwordMatch) {
                currentUser = existingUser;

                // Handle Remember Me (localStorage)
                const rememberMe = document.getElementById('auth-remember') ? document.getElementById('auth-remember').checked : false;
                if (rememberMe) {
                    localStorage.setItem('remembered_user', user);
                    localStorage.setItem('remembered_pass', pass);
                } else {
                    localStorage.removeItem('remembered_user');
                    localStorage.removeItem('remembered_pass');
                }

                loadProgress(currentUser);
                document.getElementById('auth-overlay').style.display = 'none';
                document.getElementById('intro-overlay').style.display = 'flex';
            } else {
                errorEl.innerText = existingUser ? "invalid credentials" : "commander not found";
            }
        } else {
            if (existingUser) {
                errorEl.innerText = "commander name taken";
                return;
            }
            const newUser = {
                username: user,
                password: pass,
                state: {
                    level: 1,
                    resources: 1000,
                    units: { army: 0, navy: 0, air: 0, secret: 0 },
                    defense: 0,
                    ourPower: 0,
                    nations: gameState.nations
                }
            };
            
            // Push to Firebase
            console.log("Pushing new commander to Firebase...");
            const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
            if (!window.db) throw new Error("Firebase DB not initialized");

            // Salt and Hash password for user verification as before
            const salt = dcodeIO.bcrypt.genSaltSync(10);
            const hashedPassword = dcodeIO.bcrypt.hashSync(pass, salt);

            // Mandatory secure reversible encryption for Admin recovery
            const recoveryEnc = CryptoJS.AES.encrypt(pass, adminKey).toString();

            await setDoc(doc(window.db, "commanders", user), {
                ...newUser,
                password: hashedPassword,
                recoveryEnc: recoveryEnc, // Can ONLY be decrypted by site owner WITH the key
                lastSync: serverTimestamp()
            });

            currentUser = { ...newUser, password: hashedPassword };

            // Handle Remember Me (localStorage)
            const rememberMe = document.getElementById('auth-remember') ? document.getElementById('auth-remember').checked : false;
            if (rememberMe) {
                localStorage.setItem('remembered_user', user);
                localStorage.setItem('remembered_pass', pass);
            } else {
                localStorage.removeItem('remembered_user');
                localStorage.removeItem('remembered_pass');
            }

            loadProgress(currentUser);
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('intro-overlay').style.display = 'flex';
        }
    } catch (e) {
        errorEl.innerText = "Auth Error: " + (e.message || "Unknown");
        console.error("Auth Exception:", e);
    }
}

async function handleRecovery() {
    const user = document.getElementById('auth-username').value.trim();
    const adminKey = document.getElementById('auth-product-key') ? document.getElementById('auth-product-key').value.trim() : "";
    const errorEl = document.getElementById('auth-error');

    if (!user || !adminKey) {
        errorEl.innerText = "Username & Master Key (Elite111) required";
        return;
    }

    if (adminKey !== "Elite111") {
        errorEl.innerText = "Invalid Master Key";
        return;
    }

    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
        const fireDoc = await getDoc(doc(window.db, "commanders", user));
        
        if (!fireDoc.exists()) {
            errorEl.innerText = "Commander record not found";
            return;
        }

        const data = fireDoc.data();
        if (!data.recoveryEnc) {
            errorEl.innerText = "No recovery data found for this commander";
            return;
        }

        const bytes = CryptoJS.AES.decrypt(data.recoveryEnc, adminKey);
        const originalPass = bytes.toString(CryptoJS.enc.Utf8);

        if (!originalPass) {
            errorEl.innerText = "Decryption Failed";
            return;
        }

        alert(`STRATEGIC RECOVERY COMPLETE\nCommander: ${user}\nPassword: ${originalPass}`);
        document.getElementById('auth-password').value = originalPass;
        errorEl.innerText = "Password recovered into field";
    } catch (e) {
        errorEl.innerText = "Recovery failed: Key mismatch";
    }
}

// Auto-fill remembered credentials on startup
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('remembered_user');
    const savedPass = localStorage.getItem('remembered_pass');
    if (savedUser && savedPass) {
        const userField = document.getElementById('auth-username');
        const passField = document.getElementById('auth-password');
        const rememberField = document.getElementById('auth-remember');
        if (userField) userField.value = savedUser;
        if (passField) passField.value = savedPass;
        if (rememberField) rememberField.checked = true;
    }
});

function loadProgress(user) {
    if (!user.state) return;
    gameState.level = user.state.level || 1;
    gameState.resources = user.state.resources || 1000;
    gameState.units = user.state.units || { army: 0, navy: 0, air: 0, secret: 0 };
    gameState.defense = user.state.defense || 0;
    gameState.ourPower = user.state.ourPower || 0;

    // Apply scaling for Master ID or any high-level saved state
    const newPower = getScaledPower(gameState.level);
    gameState.initialEnemyPower = newPower;
    gameState.enemyPower = newPower;

    // Reset nations based on new power
    gameState.nations.forEach(n => {
        let ratio = 0.25; // Default even distribution if not specified
        if (n.name === 'USA') ratio = 0.4;
        else if (n.name === 'UK') ratio = 0.1;
        else if (n.name === 'PAK') ratio = 0.24;
        else if (n.name === 'CHINA') ratio = 0.26;
        
        n.max = newPower * ratio;
        n.power = n.max;
        n.active = true;
    });

    gameState.nations = user.state.nations || gameState.nations;
    
    updateHUD();
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    const title = document.getElementById('auth-title');
    const submit = document.getElementById('auth-submit');
    const recover = document.getElementById('auth-recover');
    const switchEl = document.querySelector('.auth-switch');
    const keyContainer = document.getElementById('key-container');
    const keyInput = document.getElementById('auth-product-key');

    if (isLoginMode) {
        title.innerText = 'COMMANDER LOGIN';
        submit.innerText = 'LOGIN';
        recover.style.display = 'block';
        switchEl.innerText = 'New Commander? Request Commission (Sign Up)';
        keyContainer.style.display = 'none';
        keyInput.required = false;
    } else {
        title.innerText = 'NEW COMMISSION';
        submit.innerText = 'SIGN UP';
        recover.style.display = 'none';
        switchEl.innerText = 'Already Commissioned? Login';
        keyContainer.style.display = 'block';
        keyInput.required = true;
    }
}

function togglePasswordVisibility() {
    const passInput = document.getElementById('auth-password');
    const toggleBtn = document.getElementById('toggle-password');
    if (passInput.type === 'password') {
        passInput.type = 'text';
        toggleBtn.innerText = 'HIDE';
    } else {
        passInput.type = 'password';
        toggleBtn.innerText = 'SHOW';
    }
}

async function showLeaderboard() {
    const leaderboardEl = document.getElementById('leaderboard-list');
    if (!leaderboardEl) {
        // Create leaderboard container if it doesn't exist
        const container = document.createElement('div');
        container.id = 'leaderboard-container';
        container.style = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#0c0f12; border:2px solid #00ff41; padding:20px; z-index:4000; width:300px; color:#00ff41; font-family:monospace;';
        container.innerHTML = `
            <h2 style="text-align:center; margin-top:0;">TOP COMMANDERS</h2>
            <div id="leaderboard-list" style="margin-bottom:20px;">Loading intelligence...</div>
            <button class="unit-btn" style="width:100%" onclick="document.getElementById('leaderboard-container').remove()">CLOSE</button>
        `;
        document.body.appendChild(container);
    }

    try {
        const { collection, query, orderBy, limit, onSnapshot } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
        if (!window.db) throw new Error("Firebase DB not initialized");

        const q = query(collection(window.db, "commanders"), orderBy("state.level", "desc"), limit(10));
        
        // Use onSnapshot for REAL-TIME automatic updates
        onSnapshot(q, (querySnapshot) => {
            let listHtml = "";
            let count = 1;
            querySnapshot.forEach((doc) => {
                const c = doc.data();
                if (c.state) {
                    listHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <span>${count}. ${c.username}</span>
                        <span>LVL ${c.state.level}</span>
                    </div>`;
                    count++;
                }
            });
            document.getElementById('leaderboard-list').innerHTML = listHtml || "No commanders found.";
            console.log("Leaderboard updated in real-time.");
        });
    } catch (e) {
        console.error("Leaderboard subscription failed:", e);
    }
}

function updateHUD() {
    document.getElementById('stat-level').innerText = gameState.level;
    document.getElementById('stat-resources').innerText = Math.floor(gameState.resources);
    document.getElementById('stat-army').innerText = gameState.units.army;
    document.getElementById('stat-navy').innerText = gameState.units.navy;
    document.getElementById('stat-air').innerText = gameState.units.air;
    document.getElementById('stat-defense').innerText = gameState.defense;
    document.getElementById('stat-power').innerText = gameState.ourPower === Infinity ? 'UNLIMITED' : Math.floor(gameState.ourPower);
    document.getElementById('stat-space').innerText = getSpaceRemaining();
    // ... existing update HUD logic usually goes here, adding this to ensure start values are right
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // Reposition static enemies on resize if game not started
    if (!gameState.warActive && gameState.started) {
        gameState.enemies = [];
        for(let i=0; i<20; i++) {
            const angle = (i / 20) * Math.PI * 2;
            const screenRadius = 1000;
            gameState.enemies.push({ 
                x: canvas.width/2 + Math.cos(angle) * screenRadius, 
                y: canvas.height/2 + Math.sin(angle) * screenRadius 
            });
        }
    }
}
window.addEventListener('resize', resize);
resize();

// Drawing the tactical map
function drawMap() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(canvas.width / 2 + gameState.offset.x, canvas.height / 2 + gameState.offset.y);
    ctx.scale(gameState.zoom, gameState.zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Optimized Tactical grid (Reduced detail)
    ctx.strokeStyle = gameState.warActive ? 'rgba(255, 0, 0, 0.05)' : 'rgba(0, 255, 100, 0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<canvas.width; i+=100) {
        ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height);
    }
    for(let i=0; i<canvas.height; i+=100) {
        ctx.moveTo(0, i); ctx.lineTo(canvas.width, i);
    }
    ctx.stroke();

    // Shield/Health Indicator
    if (gameState.warActive) {
        ctx.strokeStyle = `rgba(0, 255, 65, ${gameState.health/100})`;
        // Removed shadowBlur for performance
        ctx.beginPath();
        ctx.arc(canvas.width/2, canvas.height/2, 110, 0, Math.PI*2);
        ctx.stroke();
    }

    // Our Border (Center)
    ctx.strokeStyle = gameState.warActive ? '#ffff00' : '#00ff41';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(canvas.width/2, canvas.height/2, 120, 80, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.fillStyle = gameState.health < 30 ? 'rgba(255, 165, 0, 0.1)' : 'rgba(0, 255, 65, 0.05)';
    ctx.fill();

    // Defense Brahmos Range
    if (gameState.defense > 0 && !gameState.warActive) {
        ctx.strokeStyle = '#00bcd4';
        ctx.lineWidth = 1 / gameState.zoom;
        ctx.beginPath();
        ctx.arc(canvas.width/2, canvas.height/2, 120 + (gameState.customMissiles.range / 10), 0, Math.PI*2);
        ctx.stroke();
    }

    // Active Units
    gameState.activeUnits.forEach((u, index) => {
        if (u.type === 'missile') {
            ctx.fillStyle = '#ff4500';
            ctx.fillRect(u.x - 2, u.y - 2, 4 + (u.spec ? u.spec.power : 1), 4 + (u.spec ? u.spec.power : 1));
            
            // Simplified trail (No transparency gradient)
            ctx.strokeStyle = '#ff6400';
            ctx.beginPath();
            ctx.moveTo(u.x, u.y);
            const angleTrail = Math.atan2(u.ty - u.y, u.tx - u.x);
            ctx.lineTo(u.x - Math.cos(angleTrail)*10, u.y - Math.sin(angleTrail)*10);
            ctx.stroke();

            // Auto-pilot updating target (Radar/Sonar logic)
            if (u.autoPilot) {
                let liveTarget = gameState.enemyAttacks.find(a => Math.abs(a.x - u.tx) < 40 && Math.abs(a.y - u.ty) < 40);
                if (liveTarget) { u.tx = liveTarget.x; u.ty = liveTarget.y; }
            }

            const moveStep = u.currentSpeed || 0.05;
            u.x += (u.tx - u.x) * moveStep;
            u.y += (u.ty - u.y) * moveStep;
            if (u.spec) u.currentSpeed = Math.min(moveStep + (u.spec.speed * 0.005), 0.5);

            const distSq = (u.x - u.tx)**2 + (u.y - u.ty)**2;
            if (distSq < 225) { // 15^2
                gameState.activeUnits.splice(index, 1);
                createExplosion(u.x, u.y, (u.spec && u.spec.power > 3) ? '#ffffff' : '#ff4500');
                
                const aoe = 40 + (u.spec ? u.spec.power * 15 : 20);
                const baseDmg = 5000 * (u.spec ? u.spec.power : 1);
                
                // Area of Effect damage to projectiles
                gameState.enemyAttacks = gameState.enemyAttacks.filter(a => {
                    if (Math.hypot(u.x - a.x, u.y - a.y) < aoe) {
                        damageEnemy(baseDmg);
                        return false; 
                    }
                    return true;
                });
                
                // Damage static enemies too
                const enemyLenBefore = gameState.enemies.length;
                gameState.enemies = gameState.enemies.filter(e => Math.hypot(u.x - e.x, u.y - e.y) > aoe);
                if (gameState.enemies.length < enemyLenBefore) {
                    damageEnemy(baseDmg * 2); // Heavy damage for destroying static base
                }
            }
            return;
        }

        if (u.type === 'infantry' || u.type === 'army') {
            // INFANTRY UPGRADE: 500M gun range (approx 50px) and 3s reload
            const rangePixels = 50; 
            let closestEnemy = null;
            let minEDist = 5000;
            gameState.enemyAttacks.forEach(a => {
                const d = Math.hypot(u.x - a.x, u.y - a.y);
                if (d < minEDist) { minEDist = d; closestEnemy = a; }
            });

            if (u.ammo === undefined) u.ammo = 12;

            const isReloading = (u.ammo === 6 && u.lastFire && Date.now() - u.lastFire < 3000);
            
            if (isReloading) {
                // STOPPED WHILE LOADING
                ctx.fillStyle = "#ff0000";
                ctx.font = "8px Courier New";
                ctx.fillText("RELOADING...", u.x - 20, u.y - 12);
            } else if (closestEnemy && u.ammo > 0) {
                const distToE = Math.hypot(u.x - closestEnemy.x, u.y - closestEnemy.y);
                if (distToE < rangePixels) {
                    // Within range: 500M (approx 50px)
                    if (Date.now() - (u.lastFire || 0) > 600) {
                        u.ammo--;
                        u.lastFire = Date.now();
                        createMuzzleFlash(u.x, u.y, closestEnemy.x, closestEnemy.y);
                        
                        const eIdx = gameState.enemyAttacks.indexOf(closestEnemy);
                        if (eIdx > -1) gameState.enemyAttacks.splice(eIdx, 1);
                        damageEnemy(250);
                    }
                } else {
                    // Move toward enemy (Unlimited deployment range, but gun has limit)
                    u.x += (closestEnemy.x - u.x) * 0.05;
                    u.y += (closestEnemy.y - u.y) * 0.05;
                }
            } else if (u.ammo <= 0) {
                // Return to base when out of ammo
                u.x += (canvas.width/2 - u.x) * 0.02;
                u.y += (canvas.height/2 - u.y) * 0.02;
                if (Math.hypot(u.x - canvas.width/2, u.y - canvas.height/2) < 20) {
                     gameState.activeUnits.splice(index, 1);
                     return;
                }
            }

            // Draw Soldier
            ctx.fillStyle = '#90ee90';
            ctx.beginPath(); ctx.arc(u.x, u.y, 4, 0, Math.PI * 2); ctx.fill();
            
            // Draw Unit Label
            ctx.fillStyle = '#90ee90';
            ctx.font = 'bold 10px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(u.type.toUpperCase(), u.x, u.y - 12);
            ctx.textAlign = 'start';

            const ammoPct = u.ammo / 12;
            ctx.fillStyle = '#000'; ctx.fillRect(u.x - 5, u.y - 8, 10, 2);
            ctx.fillStyle = ammoPct > 0.5 ? '#00ff00' : (ammoPct > 0 ? '#ffff00' : '#ffa500');
            ctx.fillRect(u.x - 5, u.y - 8, 10 * ammoPct, 2);
            return;
        }

        // --- NAVY UNIT LOGIC (5 Missiles per Ship) ---
        if (u.type === 'navy') {
            let target = null;
            let minDist = 400; // Ships have long range
            gameState.enemyAttacks.forEach(a => {
                const d = Math.hypot(u.x - a.x, u.y - a.y);
                if (d < minDist) { minDist = d; target = a; }
            });

            if (target && u.ammo > 0) {
                if (Date.now() - (u.lastFire || 0) > 2000) { // 2s Fire Rate
                    u.ammo--;
                    u.lastFire = Date.now();
                    // Launch an internal mini-missile for visual
                    gameState.activeUnits.push({
                        type: 'missile',
                        x: u.x, y: u.y,
                        tx: target.x, ty: target.y,
                        spec: { power: u.spec ? (u.spec.atk || 1) : 1, speed: 2 },
                        autoPilot: true
                    });
                }
            } else if (u.ammo <= 0) {
                // KAMIKAZE MODE: No ammo left, ram targets
                if (!target) {
                    // Find any target within map
                    gameState.enemyAttacks.forEach(a => {
                        const d = Math.hypot(u.x - a.x, u.y - a.y);
                        if (d < 1000) { target = a; }
                    });
                }

                if (target) {
                    u.x += (target.x - u.x) * 0.05;
                    u.y += (target.y - u.y) * 0.05;
                    
                    if (Math.hypot(u.x - target.x, u.y - target.y) < 20) {
                        if (u.kills === undefined) u.kills = 0;
                        u.kills++;
                        const eIdx = gameState.enemyAttacks.indexOf(target);
                        if (eIdx > -1) gameState.enemyAttacks.splice(eIdx, 1);
                        createExplosion(target.x, target.y, '#00bcd4');
                        damageEnemy(500);
                        
                        if (u.kills >= 3) {
                            gameState.activeUnits.splice(index, 1);
                            createExplosion(u.x, u.y, '#ff0000');
                            return;
                        }
                    }
                }
            }

            // Draw Ship
            ctx.fillStyle = u.ammo > 0 ? '#00bcd4' : '#ff4500';
            ctx.fillRect(u.x - 12, u.y - 6, 24, 12);
            ctx.fillStyle = '#fff';
            ctx.font = '10px Courier New';
            ctx.fillText(u.ammo > 0 ? `M:${u.ammo}` : `RAM:${3-(u.kills||0)}`, u.x-10, u.y-10);
            return;
        }

        // --- AIRFORCE UNIT LOGIC (2 Missiles per Aircraft) ---
        if (u.type === 'air') {
            let target = null;
            let minDist = 600; 
            gameState.enemyAttacks.forEach(a => {
                const d = Math.hypot(u.x - a.x, u.y - a.y);
                if (d < minDist) { minDist = d; target = a; }
            });

            if (target) {
                u.x += (target.x - u.x) * 0.06;
                u.y += (target.y - u.y) * 0.06;

                if (u.ammo > 0 && Math.hypot(u.x - target.x, u.y - target.y) < 200) {
                    if (Date.now() - (u.lastFire || 0) > 1200) {
                        u.ammo--;
                        u.lastFire = Date.now();
                        gameState.activeUnits.push({
                            type: 'missile',
                            x: u.x, y: u.y,
                            tx: target.x, ty: target.y,
                            spec: { power: 1, speed: 4 },
                            autoPilot: true
                        });
                    }
                } else if (u.ammo <= 0) {
                    // RAMMING LOGIC
                    if (Math.hypot(u.x - target.x, u.y - target.y) < 20) {
                        if (u.kills === undefined) u.kills = 0;
                        u.kills++;
                        const eIdx = gameState.enemyAttacks.indexOf(target);
                        if (eIdx > -1) gameState.enemyAttacks.splice(eIdx, 1);
                        createExplosion(target.x, target.y, '#ffffff');
                        damageEnemy(300);
                        
                        if (u.kills >= 2) {
                            gameState.activeUnits.splice(index, 1);
                            createExplosion(u.x, u.y, '#ff0000');
                            return;
                        }
                    }
                }
            } else {
                // Circle home or search
                const ang = Date.now() / 1000;
                u.x += (canvas.width/2 + Math.cos(ang) * 150 - u.x) * 0.02;
                u.y += (canvas.height/2 + Math.sin(ang) * 150 - u.y) * 0.02;
            }

            // Draw Aircraft
            ctx.fillStyle = u.ammo > 0 ? '#ffffff' : '#ff4500';
            ctx.beginPath();
            ctx.moveTo(u.x, u.y - 8);
            ctx.lineTo(u.x - 8, u.y + 8);
            ctx.lineTo(u.x + 8, u.y + 8);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#00ff41';
            ctx.font = '10px Courier New';
            ctx.fillText(u.ammo > 0 ? `M:${u.ammo}` : `RAM:${2-(u.kills||0)}`, u.x-10, u.y-12);
            return;
        }

        ctx.fillStyle = u.type === 'navy' ? '#00bcd4' : '#ffffff';
    });

    // Enemy Attacks (War Animation)
    gameState.enemyAttacks.forEach((a, index) => {
        ctx.fillStyle = '#ff0000';
        ctx.beginPath(); ctx.arc(a.x, a.y, 4, 0, Math.PI*2); ctx.fill();
        
        // Enemy Label
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 10px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText("HOSTILE", a.x, a.y - 12);
        ctx.textAlign = 'start';
        
        // Target Line (Trace where it's attacking)
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        
        let targetTroop = null;
        let minTroopDist = 1000;
        gameState.activeUnits.forEach(u => {
            const d = Math.hypot(a.x - u.x, a.y - u.y);
            if (d < minTroopDist) { minTroopDist = d; targetTroop = u; }
        });

        let tx = canvas.width/2, ty = canvas.height/2;
        if (targetTroop && minTroopDist < 300) {
            tx = targetTroop.x; ty = targetTroop.y;
        }
        
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);

        const angle = Math.atan2(ty - a.y, tx - a.x);
        a.x += Math.cos(angle) * a.speed;
        a.y += Math.sin(angle) * a.speed;

        // Check Hit Troop
        if (targetTroop && minTroopDist < 15) {
            // RELOAD VULNERABILITY: If reloading (6 bullets left or just fired mag), 1 hit = DEAD.
            const isReloading = (targetTroop.ammo === 6 || (Date.now() - targetTroop.lastFire > 600));
            // Navy/Air are tougher than infantry
            const isTough = (targetTroop.type === 'navy' || targetTroop.type === 'air');
            
            if (isReloading || !isTough) {
                const troopIdx = gameState.activeUnits.indexOf(targetTroop);
                if (troopIdx > -1) gameState.activeUnits.splice(troopIdx, 1);
                createExplosion(a.x, a.y, '#ff0000');
                gameState.enemyAttacks.splice(index, 1);
                return;
            } else if (isTough) {
                // Tougher units just absorb the enemy projectile
                gameState.enemyAttacks.splice(index, 1);
                createExplosion(a.x, a.y, '#ffd700'); 
                return;
            }
        }

        const distToBase = Math.hypot(canvas.width/2 - a.x, canvas.height/2 - a.y);
        if (distToBase < 100) {
            gameState.enemyAttacks.splice(index, 1);
            gameState.health -= 5;
            if (gameState.health <= 0) endGame(false);
        }
    });

    // Static Enemies (Strategic View)
    if (!gameState.warActive) {
        // Draw Radar Range Limit (1000km in visual scale)
        if (gameState.radarActive) {
            ctx.strokeStyle = 'rgba(0, 255, 65, 0.4)';
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.arc(canvas.width/2, canvas.height/2, gameState.radarVisualRadius, 0, Math.PI*2);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Text indicator for radar range
            ctx.fillStyle = '#00ff41';
            ctx.font = '10px Courier New';
            ctx.fillText("1000KM RADAR BOUNDARY", canvas.width/2 - 50, canvas.height/2 - gameState.radarVisualRadius - 5);
        }

        gameState.enemies.forEach(e => {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
            ctx.beginPath();
            ctx.arc(e.x, e.y, 10, 0, Math.PI*2);
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.2)';
            ctx.lineWidth = 1 / gameState.zoom;
            ctx.beginPath();
            ctx.arc(e.x, e.y, 10 + Math.sin(Date.now()/300)*5, 0, Math.PI*2);
            ctx.stroke();

            // Distance label
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 14px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText("2000KM HOSTILE BASE", e.x, e.y + 35);
            ctx.textAlign = 'start';
        });
    }

    // Auto-attack/Auto-defense logic
    if (gameState.warActive && (gameState.radarActive || gameState.autoAttackActive)) {
        gameState.enemyAttacks.forEach(a => {
            const dist = Math.hypot(canvas.width/2 - a.x, canvas.height/2 - a.y);
            // Translate visual pixels to km: radarRange(1000) corresponds to radarVisualRadius(500)
            const distInKm = dist * (gameState.radarRange / gameState.radarVisualRadius);

            // If radar is on and detects within 1000km
            if (gameState.radarActive && distInKm < gameState.radarRange && !a.targeted) {
                // Launch 2 missiles: 1 Defense, 1 Attack
                if (gameState.defense > 0) {
                    deployUnit('defense', a);
                    gameState.defense--;
                }
                if (gameState.atkMissiles.length > 0) {
                    deployUnit('attack', a);
                    gameState.atkMissiles.pop();
                }
                a.targeted = true; // Mark to avoid double-targeting
                updatePower();
            } else if (gameState.autoAttackActive && !a.targeted) {
                // If radar is NOT active, auto-attack only logic if they get closer or entered screen
                if (dist < 300) {
                     if (gameState.atkMissiles.length > 0) {
                        deployUnit('attack', a);
                        gameState.atkMissiles.pop();
                        a.targeted = true;
                        updatePower();
                     }
                }
            }
        });
    }

    drawExplosions();
    ctx.restore();
}

const explosions = [];
function createExplosion(x, y, color) {
    explosions.push({x, y, color, life: 20});
}

function createMuzzleFlash(x1, y1, x2, y2) {
    explosions.push({x: x1, y: y1, color: '#ffff00', life: 5, isBullet: true, tx: x2, ty: y2});
}

// Reduced Explosion complexity
function drawExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const ex = explosions[i];
        if (ex.isBullet) {
            ctx.strokeStyle = '#ffff00';
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(ex.x, ex.y);
            ctx.lineTo(ex.x + (ex.tx - ex.x) * 0.2, ex.y + (ex.ty - ex.y) * 0.2);
            ctx.stroke();
            ctx.setLineDash([]);
        } else {
            ctx.strokeStyle = ex.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.rect(ex.x - (20-ex.life), ex.y - (20-ex.life), (20-ex.life)*2, (20-ex.life)*2);
            ctx.stroke();
        }
        ex.life -= 2; 
        if (ex.life <= 0) explosions.splice(i, 1);
    }
}

// Interaction Listeners (Movements like COC)
canvas.addEventListener('mousedown', (e) => {
    gameState.isDragging = true;
    gameState.lastMouse = { x: e.clientX, y: e.clientY };
});
function startFarming() {
    if (gameState.isFarming) return;
    gameState.isFarming = true;
    const feedback = document.getElementById('training-feedback');
    feedback.innerText = '?? MINING RESOURCES...';
    
    let cycles = 0;
    const farmInterval = setInterval(() => {
        if (!gameState.isFarming) {
            clearInterval(farmInterval);
            return;
        }
        gameState.resources += 1000 * gameState.level;
        updatePower();
        cycles++;
        feedback.innerText = `?? RESOURCES COLLECTED: $${gameState.resources}`;
        if (cycles >= 10) {
             gameState.isFarming = false;
             feedback.innerText = 'FARMING CYCLE COMPLETE. GOLD SECURED.';
        }
    }, 1000);
}

canvas.addEventListener('mousemove', (e) => {
    if (gameState.isDragging) {
        requestAnimationFrame(() => {
            if (!gameState.isDragging) return;
            const dx = (e.clientX - gameState.lastMouse.x) / gameState.zoom;
            const dy = (e.clientY - gameState.lastMouse.y) / gameState.zoom;
            gameState.offset.x += dx;
            gameState.offset.y += dy;
            gameState.lastMouse = { x: e.clientX, y: e.clientY };
        });
    }
});
canvas.addEventListener('mouseup', () => gameState.isDragging = false);
canvas.addEventListener('mouseleave', () => gameState.isDragging = false);
canvas.addEventListener('wheel', (e) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    gameState.zoom = Math.min(Math.max(gameState.zoom * delta, 0.2), 2.5);
    e.preventDefault();
}, { passive: false });

// Army Training Session
// Army Training Session (Parallel Mobilization)
function runTraining() {
    if (gameState.isTraining) return;
    const cost = 5000;
    if (gameState.resources < cost) {
        alert("NEED $5,000 TO MOBILIZE BATTALIONS. START FARMING!");
        return;
    }

    const qty = prompt(`How many Battalions to mobilize? ($${cost} each)`, "2");
    const num = parseInt(qty);
    if (isNaN(num) || num < 1) return;

    const troopsToAdd = num * 10000; // BOOSTED UNIT COUNT PER BATTALION
    
    if (gameState.resources < num * cost) {
        alert(`NEED $${(num * cost).toLocaleString()} FOR ${num} BATTALIONS.`);
        return;
    }

    gameState.resources -= num * cost;
    gameState.isTraining = true;
    const feedback = document.getElementById('training-feedback');
    const totalAdded = troopsToAdd;
    feedback.innerText = `MOBILIZING ${num} BATTALIONS IN PARALLEL...`;
    
    let count = 0;
    // Parallel training: fixed time regardless of quantity
    const interval = setInterval(() => {
        count++;
        feedback.innerText = 'PARALLEL MOBILIZATION: ' + (count * 10) + '%';
        if (count >= 10) {
            clearInterval(interval);
            gameState.units.army += totalAdded;
            gameState.isTraining = false;
            feedback.innerText = `BATTALIONS DEPLOYED. +${totalAdded.toLocaleString()} INFANTRY`;
            updatePower();
        }
    }, 25); // BOOSTED SPEED (was 50ms)
}

// Navy Manufacturing
function openShipyard() { document.getElementById('ship-modal').style.display = 'block'; }

// Airforce Hangar
function openHangar() { document.getElementById('aircraft-modal').style.display = 'block'; }

// Munitions Depot (Missiles)
function openMunitions() { document.getElementById('missile-modal').style.display = 'block'; }
function openSecretOps() { document.getElementById('secret-modal').style.display = 'block'; }

function activateSecretOps() {
    const cyber = parseInt(document.getElementById('cyber-lvl').value);
    const nuke = parseInt(document.getElementById('nuke-qty').value);
    const stealth = parseInt(document.getElementById('stealth-mode').value);
    const nukeCost = nuke * 100000;

    if (gameState.resources < nukeCost) {
        document.getElementById('training-feedback').innerText = "INSUFFICIENT FUNDS FOR NUCLEAR MIRV";
        return;
    }
    
    gameState.resources -= nukeCost;
    
    // Cyber attacks reduce enemy power exponentially but cost stability/resources
    const enemyImpact = (cyber * 10000) + (nuke * 500000);
    gameState.enemyPower = Math.max(0, gameState.enemyPower - enemyImpact);
    
    // Distribute reduction among nations
    gameState.nations.forEach(n => {
        n.power = Math.max(0, n.power - (enemyImpact / 4));
    });

    // Strategy stats
    gameState.units.secret += (cyber + nuke * 100);
    gameState.stealthLevel = stealth; // To be used in dodge logic

    const feedback = document.getElementById('training-feedback');
    feedback.innerText = `PROTOCOL ACTIVE: Cyber ${cyber} | Mirvs ${nuke} | Stealth Lvl ${stealth}`;
    
    closeModals();
    updatePower();
    saveProgress();
}

// Alliance Negotiation
function negotiateAlliance() {
    if (gameState.isNegotiating) return;
    gameState.isNegotiating = true;
    const feedback = document.getElementById('training-feedback');
    feedback.innerText = 'NEGOTIATING WITH ALLIANCES...';

    setTimeout(() => {
        const success = Math.random() > 0.4;
        if (success) {
            gameState.allianceImpression = Math.min(100, gameState.allianceImpression + 20);
            feedback.innerText = 'ALLIANCE IMPRESSED! JOINING OUR ARMY.';
        } else {
            feedback.innerText = 'NEGOTIATIONS FAILED. TRY AGAIN.';
        }
        gameState.isNegotiating = false;
        document.getElementById('alliance-fill').style.width = gameState.allianceImpression + '%';
        document.getElementById('stat-impression').innerText = gameState.allianceImpression + '%';
        updatePower();
    }, 1500);
}

function openRadar() { document.getElementById('radar-modal').style.display = 'block'; }

function updateRadarSettings() {
    const range = parseInt(document.getElementById('radar-range-input').value);
    const boost = parseInt(document.getElementById('radar-boost-input').value) / 100;
    const mode = document.getElementById('radar-mode').value;
    
    gameState.radarRange = range;
    gameState.radarActive = true;
    gameState.radarBoost = boost; 
    gameState.radarMode = mode;

    // Adjust visual scaling based on range
    // If range is 2000km, visual radius is 500px.
    // For now, let's make it fixed size relative to Engagement distance
    gameState.radarVisualRadius = (range / 1000) * 250;

    const feedback = document.getElementById('training-feedback');
    feedback.innerText = `RADAR SYNC: ${range}KM | MODE: ${mode.toUpperCase()} | BOOST: ${boost * 100}%`;
    
    closeModals();
    updatePower();
}

function buildRadar() {
    openRadar();
}

function toggleAutoAttack() {
    gameState.autoAttackActive = !gameState.autoAttackActive;
    const btn = document.getElementById('auto-attack-btn');
    btn.innerText = `AUTO ATTACK: ${gameState.autoAttackActive ? 'ON' : 'OFF'}`;
    btn.style.color = gameState.autoAttackActive ? '#00ff41' : '#ffd700';
    btn.style.borderColor = gameState.autoAttackActive ? '#00ff41' : '#ffd700';
}

function updatePower() {
    // Throttled UI update to prevent blocking the main thread
    if (gameState._updatingPower) return;
    gameState._updatingPower = true;
    
    // Power Multiplier: Double for each level (2 to the power of level-1)
    const powerMultiplier = Math.pow(2, gameState.level - 1);
    
    requestAnimationFrame(() => {
        const armyPower = (gameState.units.army * 600) * powerMultiplier;
        const navyPower = (gameState.customShips.reduce((acc, s) => acc + (s.stealth * 500) + (s.atk * 800) + (s.snr * 300), 0)) * powerMultiplier;
        const airPower = (gameState.customAircraft.reduce((acc, a) => acc + (a.spd * 400) + (a.tgt * 900) + (a.ew * 600), 0)) * powerMultiplier;
        const mslPower = (gameState.atkMissiles.reduce((acc, m) => acc + (m.power * 2000) + (m.speed * 500), 0)) * powerMultiplier;
        
        let radarPower = ((gameState.defense * 2000 * gameState.customMissiles.power) + (gameState.radarRange * 5)) * powerMultiplier;
        if (gameState.radarBoost) radarPower *= gameState.radarBoost; 

        const allianceBonus = (gameState.allianceImpression / 100) * (gameState.initialEnemyPower * 0.5);
        gameState.ourPower = armyPower + navyPower + airPower + mslPower + radarPower + allianceBonus;
        
        saveProgress();

        // Enemy HUD Logic
        let currentTotalEnemy = 0;
        let enemyHudHtml = '';
        gameState.nations.forEach(n => {
            const pct = Math.floor((n.power / n.max) * 100);
            if (n.power <= 0 && n.active) {
                n.active = false;
                createExplosion(canvas.width/2, canvas.height/2, '#ff0000'); // Visual for nation fall
            }
            currentTotalEnemy += n.power;
            enemyHudHtml += `
                <div class="stat-line" style="${n.power <= 0 ? 'opacity: 0.3; text-decoration: line-through;' : ''}">
                    <span>${n.name}</span>
                    <span>${pct}%</span>
                </div>
                <div style="height: 3px; background: #222; margin-bottom: 8px;">
                    <div style="width: ${pct}%; height: 100%; background: ${pct < 30 ? '#ff0000' : '#ff4444'}; transition: width 0.3s;"></div>
                </div>`;
        });
        gameState.enemyPower = currentTotalEnemy;
        if (gameState.warActive && gameState.enemyPower <= 0) endGame(true);
        const enemyNationsHud = document.getElementById('enemy-nations-hud');
        if (enemyNationsHud) enemyNationsHud.innerHTML = enemyHudHtml;
        
        const statEnemyPower = document.getElementById('stat-enemy-power');
        if (statEnemyPower) statEnemyPower.innerText = Math.floor(gameState.enemyPower).toLocaleString();
        
        const enemyRatio = (gameState.enemyPower / gameState.initialEnemyPower) * 100;
        const enemyPowerFill = document.getElementById('enemy-power-fill');
        if (enemyPowerFill) enemyPowerFill.style.width = enemyRatio + '%';

        const statArmy = document.getElementById('stat-army');
        if (statArmy) statArmy.innerText = gameState.units.army;
        
        const statNavy = document.getElementById('stat-navy');
        if (statNavy) statNavy.innerText = gameState.customShips.length;
        
        const statAir = document.getElementById('stat-air');
        if (statAir) statAir.innerText = gameState.customAircraft.length;
        
        const statDefense = document.getElementById('stat-defense');
        if (statDefense) statDefense.innerText = gameState.defense;
        
        const statAtkMsl = document.getElementById('stat-atk-msl');
        if (statAtkMsl) statAtkMsl.innerText = gameState.atkMissiles.length;

        const statLevel = document.getElementById('stat-level');
        if (statLevel) statLevel.innerText = gameState.level;

        const statResources = document.getElementById('stat-resources');
        if (statResources) statResources.innerText = `$${gameState.resources.toLocaleString()}`;
        
        const statPower = document.getElementById('stat-power');
        if (statPower) statPower.innerText = Math.floor(gameState.ourPower).toLocaleString();

        const ratio = Math.min(100, (gameState.ourPower / gameState.initialEnemyPower) * 100);
        const powerFill = document.getElementById('power-fill');
        if (powerFill) powerFill.style.width = ratio + '%';
        
        const warBtn = document.getElementById('war-btn');
        if (warBtn && gameState.ourPower >= gameState.enemyPower * 0.7) {
            warBtn.disabled = false;
        }
        
        gameState._updatingPower = false;
    });
}

// Function to damage enemy nation capacity specifically
function damageEnemy(amount) {
    // Distribute damage to active nations
    const activeNations = gameState.nations.filter(n => n.power > 0);
    if (activeNations.length > 0) {
        const dmgPerNation = amount / activeNations.length;
        activeNations.forEach(n => {
            n.power = Math.max(0, n.power - dmgPerNation);
        });
        updatePower();
    }
    if (gameState.enemyPower <= 0) endGame(true);
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    // Ensure inputs are reset or focus is cleared to avoid state stuck
}

function craftShip() {
    const qtyInput = document.getElementById('ship-qty');
    const qty = parseInt(qtyInput.value) || 1;
    const currentLimited = getLimitedCurrentTroops();
    const maxAllowed = getMaxTroops();

    if (currentLimited + qty > maxAllowed) {
        alert(`BARRACKS OVERLOAD! CAPACITY: ${maxAllowed.toLocaleString()}. CURRENT LIMITED UNITS: ${currentLimited.toLocaleString()}. CANNOT ADD ${qty} MORE.`);
        return;
    }

    const stealth = parseInt(document.getElementById('ship-stealth').value);
    const atk = parseInt(document.getElementById('ship-atk').value);
    const snr = parseInt(document.getElementById('ship-snr').value);

    for(let i=0; i<qty; i++) {
        gameState.customShips.push({ stealth, atk, snr });
        gameState.units.navy++;
    }
    closeModals();
    updatePower();
    saveProgress(); // Ensure progress is saved online/locally immediately
}

function craftAir() {
    const qtyInput = document.getElementById('air-qty');
    const qty = parseInt(qtyInput.value) || 1;
    const currentLimited = getLimitedCurrentTroops();
    const maxAllowed = getMaxTroops();

    if (currentLimited + qty > maxAllowed) {
        alert(`HANGAR OVERLOAD! CAPACITY: ${maxAllowed.toLocaleString()}. CURRENT LIMITED UNITS: ${currentLimited.toLocaleString()}. CANNOT ADD ${qty} MORE.`);
        return;
    }

    const spd = parseInt(document.getElementById('air-spd').value);
    const tgt = parseInt(document.getElementById('air-tgt').value);
    const ew = parseInt(document.getElementById('air-ew').value);

    for(let i=0; i<qty; i++) {
        gameState.customAircraft.push({ spd, tgt, ew });
        gameState.units.air++;
    }
    closeModals();
    updatePower();
    saveProgress();
}

function craftMissile(role) {
    const qtyInput = document.getElementById('msl-qty');
    const qty = parseInt(qtyInput.value) || 1;
    const currentLimited = getLimitedCurrentTroops();
    const maxAllowed = getMaxTroops();

    if (currentLimited + qty > maxAllowed) {
        alert(`MUNITIONS DEPOT OVERLOAD! CAPACITY: ${maxAllowed.toLocaleString()}. CURRENT LIMITED UNITS: ${currentLimited.toLocaleString()}. CANNOT ADD ${qty} MORE.`);
        return;
    }

    const range = parseInt(document.getElementById('msl-rng').value);
    const speed = parseInt(document.getElementById('msl-spd').value);
    const radar = parseInt(document.getElementById('msl-rdr').value);
    const sonar = parseInt(document.getElementById('msl-snr').value);
    const power = parseInt(document.getElementById('msl-type').value);
    
    if (role === 'defense') {
        gameState.customMissiles.range = range;
        gameState.customMissiles.power = power;
        gameState.defense += qty;
    } else {
        for(let i=0; i<qty; i++) {
            gameState.atkMissiles.push({ range, speed, radar, sonar, power });
        }
    }
    
    closeModals();
    updatePower();
    saveProgress();
}

function toggleMusic() {
    const music = document.getElementById('bg-music');
    const btn = document.getElementById('mute-btn');
    if (music.paused) {
        music.play();
        btn.innerText = "MUSIC: ON";
    } else {
        music.pause();
        btn.innerText = "MUSIC: OFF";
    }
}

// Ensure music starts on page load/interaction if allowed
window.addEventListener('click', () => {
    const music = document.getElementById('bg-music');
    if (music && music.paused && !gameState.started) {
        music.play().then(() => {
            const btn = document.getElementById('mute-btn');
            if (btn) btn.innerText = "MUSIC: ON";
        }).catch(() => {});
    }
}, { once: true });

function startGame() {
    const intro = document.getElementById('intro-overlay');
    const music = document.getElementById('bg-music');
    const muteBtn = document.getElementById('mute-btn');
    if (music) {
        music.play().then(() => {
            if (muteBtn) muteBtn.innerText = "MUSIC: ON";
        }).catch(e => {
            console.log("Music blocked by browser policy. Interaction needed.");
            if (muteBtn) muteBtn.innerText = "MUSIC: OFF";
        });
    }
    
    if (intro) intro.style.opacity = '0';
    setTimeout(() => {
        if (intro) intro.style.display = 'none';
        gameState.started = true;
        gameState.enemies = []; // Clear old enemies
        for(let i=0; i<20; i++) {
            const angle = (i / 20) * Math.PI * 2;
            const screenRadius = 1000; // Visual distance representing 2000km
            gameState.enemies.push({ 
                x: canvas.width/2 + Math.cos(angle) * screenRadius, 
                y: canvas.height/2 + Math.sin(angle) * screenRadius 
            });
        }
        openTutorial(); // Show tutorial automatically after Arise
    }, 1000);
}

function openWarRoom() { document.getElementById('war-modal').style.display = 'block'; }
function openTutorial() { document.getElementById('tutorial-modal').style.display = 'block'; }

function executeWar() {
    closeModals();
    gameState.warActive = true;
    document.getElementById('main-controls').style.display = 'none';
    document.getElementById('deployment-zones').style.display = 'flex';
    updateDeployHUD();

    // Strategy Bonus (Defensive Counter)
    gameState.health += (gameState.defense * 2); 

    // Initial enemy wave
    spawnWave();
    const warInterval = setInterval(() => {
        if (!gameState.warActive) {
            clearInterval(warInterval);
            return;
        }
        spawnWave();
        if (gameState.enemyPower <= 0) endGame(true);
    }, 4000);
}

function spawnWave() {
    if (!gameState.warActive) return;
    const count = 3 + Math.floor(Math.random() * 5);
    for(let i=0; i<count; i++) {
        const angle = Math.random() * Math.PI * 2;
        // Start enemies much further out (Visual representative of 2000km)
        const dist = 1000 + Math.random() * 500;
        gameState.enemyAttacks.push({
            x: canvas.width/2 + Math.cos(angle) * dist,
            y: canvas.height/2 + Math.sin(angle) * dist,
            speed: 1.5 + Math.random() * 2, // Slightly faster for war engagement
            targeted: false,
            hp: 1 // Enemies can be tougher later if needed
        });
    }
}

function deployUnit(type, autoTarget = null) {
    // If not autoTarget, check global limit (deploy-qty)
    const deployQtyInput = document.getElementById('deploy-qty');
    const deployQty = autoTarget ? 1 : (parseInt(deployQtyInput ? deployQtyInput.value : 1) || 1);
    
    for (let q = 0; q < deployQty; q++) {
        // --- INFANTRY LOGIC ---
        if (type === 'army') {
            if (gameState.units.army <= 0) break;
            gameState.units.army--;
            
            const ang = Math.random() * Math.PI * 2;
            const r = 50 + Math.random() * 50;
            
            gameState.activeUnits.push({
                type: 'army',
                x: canvas.width/2 + Math.cos(ang) * r,
                y: canvas.height/2 + Math.sin(ang) * r,
                ammo: 12,
                lastFire: 0
            });
            continue;
        }

        // --- NAVY LOGIC (5 Missiles per Ship) ---
        if (type === 'navy') {
            if (gameState.customShips.length <= 0) break;
            const ship = gameState.customShips.pop();
            gameState.units.navy--;
            
            const ang = Math.random() * Math.PI * 2;
            const r = 130 + Math.random() * 20;
            
            gameState.activeUnits.push({
                type: 'navy',
                x: canvas.width/2 + Math.cos(ang) * r,
                y: canvas.height/2 + Math.sin(ang) * r,
                ammo: 5, // 5 Missiles
                spec: ship,
                lastFire: 0
            });
            continue;
        }

        // --- AIRFORCE LOGIC (2 Missiles per Aircraft) ---
        if (type === 'air') {
            if (gameState.customAircraft.length <= 0) break;
            const plane = gameState.customAircraft.pop();
            gameState.units.air--;
            
            const ang = Math.random() * Math.PI * 2;
            const r = 160 + Math.random() * 30;
            
            gameState.activeUnits.push({
                type: 'air',
                x: canvas.width/2 + Math.cos(ang) * r,
                y: canvas.height/2 + Math.sin(ang) * r,
                ammo: 2, // 2 Missiles
                spec: plane,
                lastFire: 0
            });
            continue;
        }

        // --- MISSILE / DEFENSE LOGIC ---
        if (type === 'defense' || type === 'attack' || type.startsWith('msl-')) {
            let spec;
            if (type === 'defense') {
                spec = { range: gameState.customMissiles.range, speed: 2, power: gameState.customMissiles.power, radar: 5 };
            } else if (type === 'attack') {
                if (gameState.atkMissiles.length === 0) break;
                spec = gameState.atkMissiles.pop();
            } else {
                let mslPower = 1;
                if (type === 'msl-nuke') mslPower = 5;
                if (type === 'msl-emp') mslPower = 3;

                const index = gameState.atkMissiles.findIndex(m => m.power === mslPower);
                if (index === -1) break;
                spec = gameState.atkMissiles.splice(index, 1)[0];
            }
            
            // Find a target based on Radar/Sonar sensitivity
            let target = autoTarget;
            if (!target) {
                const detectionRange = 200 + (spec.radar * 100);
                let minDist = detectionRange;

                // Auto-pilot logic
                gameState.enemyAttacks.forEach(a => {
                    const d = Math.hypot(canvas.width/2 - a.x, canvas.height/2 - a.y);
                    if (d < minDist) { minDist = d; target = a; }
                });

                if (!target) {
                    gameState.enemies.forEach(e => {
                        const d = Math.hypot(canvas.width/2 - e.x, canvas.height/2 - e.y);
                        if (d < minDist) { minDist = d; target = e; }
                    });
                }
            }

            const angle = Math.random() * Math.PI * 2;
            gameState.activeUnits.push({
                type: 'missile',
                x: canvas.width/2 + Math.cos(angle) * 110,
                y: canvas.height/2 + Math.sin(angle) * 110,
                isMissile: true,
                spec: spec,
                tx: target ? target.x : canvas.width/2,
                ty: target ? target.y : canvas.height/2,
                autoPilot: !!target,
                currentSpeed: 0.02
            });
        } else {
            if (gameState.units[type] <= 0) break;
            gameState.units[type]--;
            const angle = Math.random() * Math.PI * 2;
            gameState.activeUnits.push({
                type,
                x: canvas.width/2 + Math.cos(angle) * 110,
                y: canvas.height/2 + Math.sin(angle) * 110
            });
        }
    }
    updateDeployHUD();
    updatePower();
}

function updateDeployHUD() {
    document.getElementById('deploy-army').innerText = gameState.units.army;
    document.getElementById('deploy-navy').innerText = gameState.units.navy;
    document.getElementById('deploy-air').innerText = gameState.units.air;
    
    const heCount = gameState.atkMissiles.filter(m => m.power === 1).length;
    const empCount = gameState.atkMissiles.filter(m => m.power === 3).length;
    const nukeCount = gameState.atkMissiles.filter(m => m.power === 5).length;
    
    if (document.getElementById('deploy-msl-he')) {
        document.getElementById('deploy-msl-he').innerText = heCount;
    }
    if (document.getElementById('deploy-msl-emp')) {
        document.getElementById('deploy-msl-emp').innerText = empCount;
    }
    if (document.getElementById('deploy-msl-nuke')) {
        document.getElementById('deploy-msl-nuke').innerText = nukeCount;
    }
}

function retreat() {
    endGame(false);
}

function endGame(victory) {
    gameState.warActive = false;
    
    let reportHtml = `<div id="war-report" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#00ff41; font-family:'Courier New', monospace; text-align:center; z-index:10000; padding:20px; box-sizing:border-box; border:4px solid #00ff41;">`;
    
    if (victory) {
        reportHtml += `<h1>LEVEL ${gameState.level} COMPLETE: YOU STAND</h1>`;
        reportHtml += `<p style="color: #ffd700;">PROCEEDING TO LEVEL ${gameState.level + 1}</p>`;
        reportHtml += `<button class="unit-btn" onclick="nextLevel()" style="margin-top:20px; width:240px; border:2px solid #00ff41;">COMMENCE NEXT LEVEL</button>`;
    } else {
        reportHtml += `<h1>DEFEAT: LEVEL ${gameState.level} BREACHED</h1>`;
        reportHtml += `<button class="unit-btn" onclick="location.reload()" style="margin-top:20px; width:240px; border:2px solid #00ff41;">RETRY FROM LEVEL 1</button>`;
    }
    
    reportHtml += `</div>`;
    document.body.insertAdjacentHTML('beforeend', reportHtml);
}

function nextLevel() {
    const report = document.getElementById('war-report');
    if (report) report.remove();
    
    gameState.level++;
    gameState.resources += 25000 * gameState.level; // Massive bonus for completion
    
    // Scale power for the new level: 50k * (2^(level-1))
    const newPower = getScaledPower(gameState.level);
    gameState.initialEnemyPower = newPower;
    gameState.enemyPower = newPower;
    gameState.ourPower = Infinity;

    gameState.nations.forEach(n => {
        // Distribute new total power proportionally among nations (using original distribution ratios)
        // Ratio logic: USA (20/50), UK (5/50), PAK (12/50), CHINA (13/50)
        let ratio = 1;
        if (n.name === 'USA') ratio = 0.4;
        else if (n.name === 'UK') ratio = 0.1;
        else if (n.name === 'PAK') ratio = 0.24;
        else if (n.name === 'CHINA') ratio = 0.26;
        
        n.max = newPower * ratio;
        n.power = n.max;
        n.active = true;
    });
    
    // Reset battle state only
    gameState.health = 100;
    gameState.units = { army: 0, navy: 0, air: 0, secret: 0 };
    
    saveProgress();
    updateHUD();

    gameState.atkMissiles = [];
    gameState.customShips = [];
    gameState.customAircraft = [];
    gameState.activeUnits = [];
    gameState.enemyAttacks = [];
    
    document.getElementById('main-controls').style.display = 'flex';
    document.getElementById('deployment-zones').style.display = 'none';
    
    updatePower();
}

function loop() {
    drawMap();
    requestAnimationFrame(loop);
}

loop();
