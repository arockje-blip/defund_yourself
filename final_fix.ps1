$path = "c:\Users\arock\Desktop\defund_yourself\game.js"
$content = Get-Content $path -Raw

# Replace the messy duplicated enemy logic with a single clean version
$pattern = '(?ms)// Enemy Attacks \(War Animation\)\s+gameState\.enemyAttacks\.forEach\(\(a, index\) => {.*?}\);\s+// Target Logic:.*?gameState\.health -= 5;\s+}\);\s+'
$replacement = @'
    // Enemy Attacks (War Animation)
    gameState.enemyAttacks.forEach((a, index) => {
        ctx.fillStyle = "#ff0000";
        ctx.beginPath(); ctx.arc(a.x, a.y, 4, 0, Math.PI*2); ctx.fill();
        
        // Find nearest active unit (troop) to attack first
        let targetTroop = null;
        let minTroopDist = 1000;
        gameState.activeUnits.forEach(u => {
            const d = Math.hypot(a.x - u.x, a.y - u.y);
            if (d < minTroopDist) { minTroopDist = d; targetTroop = u; }
        });

        // Target Logic: If a troop is within 300px, move to and attack troop. Otherwise, target base.
        let tx = canvas.width / 2, ty = canvas.height / 2;
        if (targetTroop && minTroopDist < 300) {
            tx = targetTroop.x; ty = targetTroop.y;
        }

        const angle = Math.atan2(ty - a.y, tx - a.x);
        a.x += Math.cos(angle) * a.speed;
        a.y += Math.sin(angle) * a.speed;

        // Check Hit Troop
        if (targetTroop && minTroopDist < 15) {
            // RELOAD VULNERABILITY: 1 hit while reloading = DEAD
            const isReloading = (targetTroop.ammo === 6 || (targetTroop.lastFire && Date.now() - targetTroop.lastFire > 600));
            if (isReloading) {
                const troopIdx = gameState.activeUnits.indexOf(targetTroop);
                if (troopIdx > -1) gameState.activeUnits.splice(troopIdx, 1);
                createExplosion(a.x, a.y, "#ff0000");
                gameState.enemyAttacks.splice(index, 1);
                return;
            }
        }

        const distToBase = Math.hypot(canvas.width / 2 - a.x, canvas.height / 2 - a.y);
        if (distToBase < 100) {
            gameState.enemyAttacks.splice(index, 1);
            gameState.health -= 5;
        }
    });

