const canvas = document.getElementById('war-canvas');
const ctx = canvas.getContext('2d');

let currentUser = null;
let isLoginMode = true;

// Master Credential
const MASTER_COMMANDER = { 
    username: "AJ", 
    password: "02052004",
    state: { level: 99, resources: 999999, ourPower: 1000000 }
};

// Scaling Formula for Power: 50k * (2^(level-1))
function getScaledPower(level) {
    return 50000 * Math.pow(2, level - 1);
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
    radarRange: 500,
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
    zoom: 1
};

// Troop Limit Logic: 10,000 at level 1, +100% (doubles) each level
// Rule: Limit applies to Navy, Airforce, and Munitions (Missiles). Infantry and Secret Ops are exempt.
function getMaxTroops() {
    return 10000 * Math.pow(2, gameState.level - 1);
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
    
    const userData = {
        username: currentUser.username,
        password: currentUser.password, // Still using local password logic for simplicity
        state: {
            level: gameState.level,
            resources: gameState.resources,
            units: gameState.units,
            defense: gameState.defense,
            ourPower: gameState.ourPower,
            nations: gameState.nations
        },
        lastSync: new Date().toISOString()
    };
    
    try {
        const { error } = await supabase
            .from('commanders')
            .upsert(userData, { onConflict: 'username' });
        
        if (error) throw error;
        console.log("Tactically synced to Supabase.");

        // Firebase Push (Firestore)
        const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
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
    const errorEl = document.getElementById('auth-error');

    if (!user || !pass) {
        errorEl.innerText = "credentials required";
        return;
    }

    try {
        // Master User Pre-load Logic
        if (user === MASTER_COMMANDER.username && pass === MASTER_COMMANDER.password) {
            currentUser = MASTER_COMMANDER;
            loadProgress(currentUser);
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('intro-overlay').style.display = 'flex';
            return;
        }

        // Firebase Intelligence Pull (Primary for others)
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
        const fireDoc = await getDoc(doc(window.db, "commanders", user));
        let existingUser = null;

        if (fireDoc.exists()) {
            existingUser = fireDoc.data();
            console.log("Intelligence gathered from Firebase.");
        } else {
            // Supabase Fallback/Legacy Intelligence
            const { data: supabaseUser, error: fetchError } = await supabase
                .from('commanders')
                .select('*')
                .eq('username', user)
                .single();
            existingUser = supabaseUser;
        }

        if (isLoginMode) {
            if (existingUser && existingUser.password === pass) {
                currentUser = existingUser;
                loadProgress(currentUser);
                document.getElementById('auth-overlay').style.display = 'none';
                document.getElementById('intro-overlay').style.display = 'flex';
            } else {
                errorEl.innerText = "invalid credentials";
            }
        } else {
            if (existingUser) {
                errorEl.innerText = "commander name taken";
                return;
            }
            const newUser = { username: user, password: pass, state: null };
            
            // Push to Supabase
            const { error: insertError } = await supabase
                .from('commanders')
                .insert([newUser]);
            if (insertError) throw insertError;

            // Push to Firebase
            const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
            await setDoc(doc(window.db, "commanders", user), {
                ...newUser,
                lastSync: serverTimestamp()
            });

            currentUser = newUser;
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('intro-overlay').style.display = 'flex';
        }
    } catch (e) {
        errorEl.innerText = "Connection Error";
        console.error(e);
    }
}

function loadProgress(user) {
    if (!user.state) return;
    gameState.level = user.state.level || 1;
    gameState.resources = user.state.resources || 1000;
    gameState.units = user.state.units || { army: 0, navy: 0, air: 0, secret: 0 };
    gameState.defense = user.state.defense || 0;
    gameState.ourPower = user.state.ourPower || 0;
    gameState.nations = user.state.nations || gameState.nations;
    
    updateHUD();
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? 'COMMANDER LOGIN' : 'NEW COMMISSION';
    document.getElementById('auth-submit').innerText = isLoginMode ? 'LOGIN' : 'SIGN UP';
    const switchText = isLoginMode ? 'New Commander? Request Commission (Sign Up)' : 'Already Commissioned? Login';
    document.querySelector('.auth-switch').innerText = switchText;
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
    try {
        const { data, error } = await supabase
            .from('commanders')
            .select('username, state')
            .order('state->level', { ascending: false })
            .limit(10);

        if (error) throw error;

        let list = "TOP COMMANDERS:\n\n";
        data.forEach((c, i) => {
            list += `${i + 1}. ${c.username} - LVL ${c.state.level}\n`;
        });
        alert(list);
    } catch (e) {
        alert("Unable to fetch leaderboard at this time.");
        console.error(e);
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
            gameState.enemies.push({ x: canvas.width/2 + Math.cos(angle)*350, y: canvas.height/2 + Math.sin(angle)*350 });
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
    ctx.strokeStyle = gameState.warActive ? '#ff0000' : '#00ff41';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(canvas.width/2, canvas.height/2, 120, 80, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.fillStyle = gameState.health < 30 ? 'rgba(255, 0, 0, 0.1)' : 'rgba(0, 255, 65, 0.05)';
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

        ctx.fillStyle = u.type === 'army' ? '#ffd700' : u.type === 'navy' ? '#00bcd4' : '#ffffff';
        ctx.beginPath();
        ctx.arc(u.x, u.y, 5, 0, Math.PI*2);
        ctx.fill();
        
        // Move towards nearest enemy attack
        let target = null;
        let minDist = 1000;
        gameState.enemyAttacks.forEach(a => {
            const d = Math.hypot(u.x - a.x, u.y - a.y);
            if (d < minDist) { minDist = d; target = a; }
        });

        if (target) {
            u.x += (target.x - u.x) * 0.05;
            u.y += (target.y - u.y) * 0.05;
            if (minDist < 10) {
                // Intercepted
                gameState.enemyAttacks = gameState.enemyAttacks.filter(a => a !== target);
                gameState.activeUnits.splice(index, 1);
                createExplosion(u.x, u.y, '#00ff41');
                damageEnemy(1500); // Reduce nation capacity on intercept
            }
        } else {
            // Idle movement or returning to border
            u.x += (canvas.width/2 - u.x) * 0.01;
            u.y += (canvas.height/2 - u.y) * 0.01;
        }
    });

    // Enemy Attacks (War Animation)
    gameState.enemyAttacks.forEach((a, index) => {
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(a.x, a.y, 4, 0, Math.PI*2);
        ctx.fill();
        
        // Move towards center
        const angle = Math.atan2(canvas.height/2 - a.y, canvas.width/2 - a.x);
        a.x += Math.cos(angle) * a.speed;
        a.y += Math.sin(angle) * a.speed;

        // Check breach
        const dist = Math.hypot(canvas.width/2 - a.x, canvas.height/2 - a.y);
        if (dist < 100) {
            gameState.enemyAttacks.splice(index, 1);
            gameState.health -= 5;
            createExplosion(a.x, a.y, '#ff0000');
            if (gameState.health <= 0) endGame(false);
        }
    });

    // Static Enemies (Strategic View)
    if (!gameState.warActive) {
        // Draw Radar Range (500km)
        if (gameState.radarActive) {
            ctx.strokeStyle = 'rgba(0, 255, 65, 0.4)';
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.arc(canvas.width/2, canvas.height/2, gameState.radarRange, 0, Math.PI*2);
            ctx.stroke();
            ctx.setLineDash([]);
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
        });
    }

    // Auto-attack/Auto-defense logic
    if (gameState.warActive && (gameState.radarActive || gameState.autoAttackActive)) {
        gameState.enemyAttacks.forEach(a => {
            const dist = Math.hypot(canvas.width/2 - a.x, canvas.height/2 - a.y);
            // If radar is on and detects within 500km
            if (gameState.radarActive && dist < gameState.radarRange && !a.targeted) {
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

// Reduced Explosion complexity
function drawExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const ex = explosions[i];
        ctx.strokeStyle = ex.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(ex.x - (20-ex.life), ex.y - (20-ex.life), (20-ex.life)*2, (20-ex.life)*2);
        ctx.stroke();
        ex.life -= 2; // Faster removal
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
    feedback.innerText = '⛏️ MINING RESOURCES...';
    
    let cycles = 0;
    const farmInterval = setInterval(() => {
        if (!gameState.isFarming) {
            clearInterval(farmInterval);
            return;
        }
        gameState.resources += 1000 * gameState.level;
        updatePower();
        cycles++;
        feedback.innerText = `⛏️ RESOURCES COLLECTED: $${gameState.resources}`;
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
    gameState.zoom = Math.min(Math.max(gameState.zoom * delta, 0.5), 2.5);
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
    const addedSecret = (cyber + nuke * 50);
    
    gameState.units.secret += addedSecret;
    gameState.enemyPower = Math.max(10000, gameState.enemyPower - (cyber * 5000));
    
    const feedback = document.getElementById('training-feedback');
    feedback.innerText = `SECRET PROTOCOL: CYBER AT LEVEL ${cyber}${nuke > 0 ? ' + NUCLEAR ACTIVE' : ''}`;
    
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
    
    gameState.radarRange = range;
    gameState.radarActive = true;
    gameState.radarBoost = boost; // New multiplier for defensive power

    const feedback = document.getElementById('training-feedback');
    feedback.innerText = `RADAR UPDATED: ${range}KM RANGE. BOOST: ${boost * 100}%`;
    
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

function startGame() {
    const intro = document.getElementById('intro-overlay');
    if (intro) intro.style.opacity = '0';
    setTimeout(() => {
        if (intro) intro.style.display = 'none';
        gameState.started = true;
        gameState.enemies = []; // Clear old enemies
        for(let i=0; i<20; i++) {
            const angle = (i / 20) * Math.PI * 2;
            gameState.enemies.push({ x: canvas.width/2 + Math.cos(angle)*350, y: canvas.height/2 + Math.sin(angle)*350 });
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
        const dist = Math.max(canvas.width, canvas.height) / 2;
        gameState.enemyAttacks.push({
            x: canvas.width/2 + Math.cos(angle) * dist,
            y: canvas.height/2 + Math.sin(angle) * dist,
            speed: 1 + Math.random() * 1.5,
            targeted: false
        });
    }
}

function deployUnit(type, autoTarget = null) {
    const deployQty = autoTarget ? 1 : (parseInt(document.getElementById('deploy-qty').value) || 1);
    
    for (let q = 0; q < deployQty; q++) {
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
