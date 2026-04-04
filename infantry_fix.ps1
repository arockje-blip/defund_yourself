$path = "c:\Users\arock\Desktop\defund_yourself\game.js"
$content = Get-Content $path -Raw

$infantryLogic = @'
        } else if (u.type === 'infantry') {
            const dist = Math.hypot(u.tx - u.x, u.ty - u.y);
            const rangeLimit = 150; 
            if (dist > rangeLimit) {
                const angle = Math.atan2(u.ty - u.y, u.tx - u.x);
                u.x += Math.cos(angle) * 1.5;
                u.y += Math.sin(angle) * 1.5;
            } else if (u.ammo > 0) {
                if (Date.now() - u.lastFire > 600) {
                    u.ammo--;
                    u.lastFire = Date.now();
                    createMuzzleFlash(u.x, u.y, u.tx, u.ty);
                    damageEnemy(100); 
                    if (u.ammo === 6) u.lastFire = Date.now() + 1500;
                }
            } else {
                u.tx = canvas.width / 2; u.ty = canvas.height / 2;
                if (dist < 10) { gameState.activeUnits.splice(index, 1); return; }
            }
            ctx.fillStyle = '#90ee90';
            ctx.beginPath(); ctx.arc(u.x, u.y, 4, 0, Math.PI * 2); ctx.fill();
            const ammoPct = u.ammo / 12;
            ctx.fillStyle = '#000'; ctx.fillRect(u.x - 5, u.y - 8, 10, 2);
            ctx.fillStyle = ammoPct > 0.5 ? '#00ff00' : (ammoPct > 0 ? '#ffff00' : '#ff0000');
            ctx.fillRect(u.x - 5, u.y - 8, 10 * ammoPct, 2);
        }
