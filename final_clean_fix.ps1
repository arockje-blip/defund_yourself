$path = "c:\Users\arock\Desktop\defund_yourself\game.js"
$content = Get-Content $path -Raw

# Replace the broken loop entirely
$pattern = '(?ms)gameState\.enemyAttacks\.forEach\(\(a, index\) => {.*?}\);(\s+// Target Logic:.*)'
$replacement = @'
    gameState.enemyAttacks.forEach((a, index) => {
        ctx.fillStyle = "#ff0000";
        ctx.beginPath(); ctx.arc(a.x, a.y, 4, 0, Math.PI*2); ctx.fill();
        
        let tx = canvas.width / 2, ty = canvas.height / 2;
        let targetTroop = null;
        let minTDist = 1000;

        gameState.activeUnits.forEach(u => {
            const d = Math.hypot(a.x - u.x, a.y - u.y);
            if (d < minTDist) { minTDist = d; targetTroop = u; }
        });

        if (targetTroop && minTDist < 300) { tx = targetTroop.x; ty = targetTroop.y; }

        const angle = Math.atan2(ty - a.y, tx - a.x);
        a.x += Math.cos(angle) * a.speed; a.y += Math.sin(angle) * a.speed;

        if (targetTroop && minTDist < 15) {
            const isReloading = (targetTroop.ammo === 6 || (Date.now() - targetTroop.lastFire > 600));
            if (isReloading) {
                const uIdx = gameState.activeUnits.indexOf(targetTroop);
                if (uIdx > -1) gameState.activeUnits.splice(uIdx, 1);
                createExplosion(a.x, a.y, "#ff0000");
                gameState.enemyAttacks.splice(index, 1); return;
            }
        }

        const dB = Math.hypot(canvas.width / 2 - a.x, canvas.height / 2 - a.y);
        if (dB < 100) {
            gameState.enemyAttacks.splice(index, 1);
            gameState.health -= 5;
        }
    });
