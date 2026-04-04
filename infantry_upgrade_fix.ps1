$path = "c:\Users\arock\Desktop\defund_yourself\game.js"
$content = Get-Content $path -Raw

# 1. Add Infantry Vulnerability to the general Troop logic
$troopLogic = @'
        if (u.type === 'army') {
            // INFANTRY UPGRADE: 500M range (1 pixel) and 3s reload
            const rangePixels = 1; // Visual radius for 500M
            let closestEnemy = null;
            let minEDist = 1000;
            gameState.enemyAttacks.forEach(a => {
                const d = Math.hypot(u.x - a.x, u.y - a.y);
                if (d < minEDist) { minEDist = d; closestEnemy = a; }
            });

            // Initialize ammo if missing
            if (u.ammo === undefined) u.ammo = 12;

            if (closestEnemy && u.ammo > 0) {
                const isReloading = (u.ammo === 6 && Date.now() - u.lastFire < 3000);
                
                if (isReloading) {
                    // STOPPED WHILE LOADING: Movement frozen
                    ctx.fillStyle = "#ff0000";
                    ctx.font = "8px Courier New";
                    ctx.fillText("RELOADING...", u.x - 20, u.y - 12);
                } else if (minEDist < rangePixels) {
                    // Within firing range: 500M
                    if (Date.now() - (u.lastFire || 0) > 600) {
                        u.ammo--;
                        u.lastFire = Date.now();
                        createMuzzleFlash(u.x, u.y, closestEnemy.x, closestEnemy.y);
                        
                        // 1 Bullet = 1 Kill
                        const eIdx = gameState.enemyAttacks.indexOf(closestEnemy);
                        if (eIdx > -1) gameState.enemyAttacks.splice(eIdx, 1);
                        damageEnemy(250);
                    }
                } else {
                    // Too far: Move towards target
                    u.x += (closestEnemy.x - u.x) * 0.05;
                    u.y += (closestEnemy.y - u.y) * 0.05;
                }
            } else if (u.ammo <= 0) {
                // Return for ammo/retreat
                u.x += (canvas.width/2 - u.x) * 0.02;
                u.y += (canvas.height/2 - u.y) * 0.02;
                if (Math.hypot(u.x - canvas.width/2, u.y - canvas.height/2) < 20) {
                     gameState.activeUnits.splice(index, 1);
                     return;
                }
            }

            // Draw Soldier
            ctx.fillStyle = '#90ee90';
            ctx.beginPath();
            ctx.arc(u.x, u.y, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Ammo
            const ammoPct = u.ammo / 12;
            ctx.fillStyle = '#000'; ctx.fillRect(u.x - 5, u.y - 8, 10, 2);
            ctx.fillStyle = ammoPct > 0.5 ? '#00ff00' : (ammoPct > 0 ? '#ffff00' : '#ff0000');
            ctx.fillRect(u.x - 5, u.y - 8, 10 * ammoPct, 2);
            return;
        }
