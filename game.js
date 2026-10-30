const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- IMAGE LOADING ---
const playerImg = new Image();
playerImg.src = 'images/russolini.png';
const bossImg = new Image();
bossImg.src = 'images/omega_maxiushka.png';
const fireBallImg = new Image();
fireBallImg.src = 'images/fireball.png';

const leftPawImg = new Image();
leftPawImg.src = 'images/paw_left.png';
const rightPawImg = new Image();
rightPawImg.src = 'images/paw_right.png';

// NEW: Maxo-Blaster Image (Add this to your images folder!)
const maxoBlasterImg = new Image();
maxoBlasterImg.src = 'images/maxo_blaster.png';

// --- OFFSCREEN CANVAS FOR PIXEL-PERFECT PAW COLLISION ---
const hitCanvas = document.createElement('canvas');
hitCanvas.width = canvas.width;
hitCanvas.height = canvas.height;
const hitCtx = hitCanvas.getContext('2d');

// --- GAME STATE ---
let gameState = 'playing';
let attackTimer = 0;
let projectiles = [];
let maxoBlasters = []; // NEW: Array to hold blasters
let blasterTimer = 0;  // NEW: Timer for spawning blasters
let showWarning = false;
let warningTimer = 0;
let pixelPerfectBroken = false;

// --- PLAYER ---
const player = {
    x: 400, 
    y: 450, 
    radius: 8,
    speed: 4,
    hp: 100,
    maxHp: 100,
    invulnerableTimer: 0
};

// --- BOSS ---
const boss = { x: 400, y: 200 };

// --- PAWS STATE ---
const paws = {
    left: { x: 100, y: 350, angle: 0, state: 'idle', timer: 0 },
    right: { x: 700, y: 350, angle: 0, state: 'idle', timer: 0 },
    attackCooldown: 180 
};

// Keys
const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function update() {
    if (gameState !== 'playing') return;

    // 1. Player Movement
    if (keys['ArrowLeft'] || keys['a']) player.x -= player.speed;
    if (keys['ArrowRight'] || keys['d']) player.x += player.speed;
    if (keys['ArrowUp'] || keys['w']) player.y -= player.speed;
    if (keys['ArrowDown'] || keys['s']) player.y += player.speed;

    // 2. Boundary Check
    let hitBoundary = false;
    if (player.x - player.radius < 100) { player.x = 100; hitBoundary = true; }
    if (player.x + player.radius > 700) { player.x = 700; hitBoundary = true; }
    if (player.y - player.radius < 300) { player.y = 300; hitBoundary = true; } 
    if (player.y + player.radius > 550) { player.y = 550; hitBoundary = true; } 

    if (hitBoundary) {
        player.x = 400;
        player.y = 450;
        showWarning = true;
        warningTimer = 120; 
    }

    if (warningTimer > 0) warningTimer--;
    else showWarning = false;

    // 3. Invulnerability
    if (player.invulnerableTimer > 0) player.invulnerableTimer--;

    // 4. Fireballs
    attackTimer++;
    if (attackTimer % 15 === 0) {
        let angle = Math.random() * Math.PI * 2;
        projectiles.push({
            x: boss.x, y: boss.y,
            vx: Math.cos(angle) * 4,
            vy: Math.sin(angle) * 4,
            radius: 10
        });
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        p.x += p.vx;
        p.y += p.vy;

        let dist = Math.hypot(p.x - player.x, p.y - player.y);
        if (dist < p.radius + player.radius && player.invulnerableTimer <= 0) {
            player.hp -= 5; 
            player.invulnerableTimer = 30; 
            projectiles.splice(i, 1); 
            continue;
        }

        if (p.x < -50 || p.x > canvas.width + 50 || p.y < -50 || p.y > canvas.height + 50) {
            projectiles.splice(i, 1);
        }
    }

    // 5. PAWS LOGIC
    paws.attackCooldown--;
    if (paws.attackCooldown <= 0) {
        if (Math.random() > 0.5) {
            paws.left.state = 'attacking';
            paws.left.timer = 0;
        } else {
            paws.right.state = 'attacking';
            paws.right.timer = 0;
        }
        paws.attackCooldown = 240; 
    }

    ['left', 'right'].forEach(side => {
        let paw = paws[side];
        if (paw.state === 'attacking') {
            paw.timer++;
            if (side === 'left') {
                paw.angle = Math.sin(paw.timer * 0.01) * 0.1; 
                paw.x = 200 + Math.sin(paw.timer * 0.1) * 200;
            } else {
                paw.angle = -Math.sin(paw.timer * 0.01) * 0.1;
                paw.x = 500 - Math.sin(paw.timer * 0.1) * 200;
            }
            if (paw.timer > 60) {
                paw.state = 'idle';
                paw.angle = 0;
                paw.x = side === 'left' ? 100 : 700;
            }
        }
    });

    if (player.invulnerableTimer <= 0) {
        if (checkPawCollision(paws.left.x, paws.left.y, paws.left.angle, leftPawImg) || 
            checkPawCollision(paws.right.x, paws.right.y, paws.right.angle, rightPawImg)) {
            player.hp -= 15; 
            player.invulnerableTimer = 60; 
        }
    }

    // 6. MAXO-BLASTER LOGIC
    blasterTimer++;
    // Spawn a blaster every 2 seconds (120 frames)
    if (blasterTimer >= 120) {
        spawnMaxoBlaster();
        blasterTimer = 0;
    }

    // Update each blaster
    for (let i = maxoBlasters.length - 1; i >= 0; i--) {
        let b = maxoBlasters[i];
        
        if (b.state === 'charging') {
            b.timer--;
            // Track the player while charging
            b.angle = Math.atan2(player.y - b.y+20, player.x - b.x+23);
            
            // When charge finishes, fire!
            if (b.timer <= 0) {
                b.state = 'firing';
                b.timer = 15; // Laser stays on screen for 15 frames
            }
        } else if (b.state === 'firing') {
            b.timer--;
            // Check if laser hits player
            if (player.invulnerableTimer <= 0 && checkLaserHit(b)) {
                player.hp -= 25; // High damage!
                player.invulnerableTimer = 60;
            }
            
            // Remove blaster after firing
            if (b.timer <= 0) {
                maxoBlasters.splice(i, 1);
            }
        }
    }

    if (player.hp <= 0) gameState = 'gameover';
}

// --- MAXO-BLASTER FUNCTIONS ---

function spawnMaxoBlaster() {
    // Spawn within 100px of the player
    let angle = Math.random() * Math.PI * 2;
    let dist = Math.random() * 100;
    let bx = player.x + Math.cos(angle) * dist;
    let by = player.y + Math.sin(angle) * dist;

    maxoBlasters.push({
        x: bx,
        y: by,
        angle: Math.atan2(player.y - by, player.x - bx),
        state: 'charging',
        timer: 60 // 1 second charge up
    });
}

function checkLaserHit(blaster) {
    // Calculate distance from player to the laser line
    let lineLength = 2000; // Laser goes far
    let endX = blaster.x + Math.cos(blaster.angle) * lineLength;
    let endY = blaster.y + Math.sin(blaster.angle) * lineLength;
    
    // Math formula to find the shortest distance from a point to a line
    let numerator = Math.abs((endY - blaster.y) * player.x - (endX - blaster.x) * player.y + endX * blaster.y - endY * blaster.x);
    let denominator = Math.hypot(endX - blaster.x, endY - blaster.y);
    let distanceToLine = numerator / denominator;
    
    // If distance is less than player radius + laser thickness, it's a hit
    return distanceToLine < player.radius + 10;
}

// --- COLLISION ---
function checkPawCollision(pawX, pawY, angle, img) {
    if (!img.complete || img.naturalWidth === 0) return false;
    if (pixelPerfectBroken) {
        return Math.hypot(player.x - pawX, player.y - pawY) < 80;
    }
    hitCtx.clearRect(0, 0, hitCanvas.width, hitCanvas.height);
    hitCtx.save();
    hitCtx.translate(pawX, pawY);
    hitCtx.rotate(angle);
    hitCtx.drawImage(img, -img.width / 2, -img.height / 2);
    hitCtx.restore();

    if (player.x >= 0 && player.x < hitCanvas.width && player.y >= 0 && player.y < hitCanvas.height) {
        try {
            const pixel = hitCtx.getImageData(player.x, player.y, 1, 1).data;
            return pixel[3] > 0; 
        } catch (e) {
            pixelPerfectBroken = true;
            return Math.hypot(player.x - pawX, player.y - pawY) < 80;
        }
    }
    return false;
}

// --- DRAWING ---
function draw() {
    ctx.fillStyle = '#1a0b00';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Boss
    if (bossImg.complete && bossImg.naturalWidth > 0) {
        ctx.drawImage(bossImg, boss.x - 450, boss.y - 200, 900, 400);
    } else {
        ctx.fillStyle = '#ff9800';
        ctx.fillRect(boss.x - 100, boss.y - 100, 200, 200);
    }

    // Paws
    ctx.save();
    ctx.translate(paws.left.x, paws.left.y);
    ctx.rotate(paws.left.angle);
    if (leftPawImg.complete && leftPawImg.naturalWidth > 0) ctx.drawImage(leftPawImg, -100, -100, 200, 200); 
    ctx.restore();

    ctx.save();
    ctx.translate(paws.right.x, paws.right.y);
    ctx.rotate(paws.right.angle);
    if (rightPawImg.complete && rightPawImg.naturalWidth > 0) ctx.drawImage(rightPawImg, -100, -100, 200, 200);
    ctx.restore();

    // Maxo-Blasters
    for (let b of maxoBlasters) {
        // Draw the laser if firing
        if (b.state === 'firing') {
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x + Math.cos(b.angle) * 2000, b.y + Math.sin(b.angle) * 2000);
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
            ctx.lineWidth = 20;
            ctx.stroke();
            
            // Inner white core of laser
            ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
            ctx.lineWidth = 8;
            ctx.stroke();
        }

        // Draw the blaster sprite
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);
        
        // Make it pulse while charging
        let scale = 1;
        if (b.state === 'charging') {
            scale = 1 + Math.sin(Date.now() / 50) * 0.1;
        }
        
        if (maxoBlasterImg.complete && maxoBlasterImg.naturalWidth > 0) {
            ctx.drawImage(maxoBlasterImg, -40 * scale, -40 * scale, 80 * scale, 80 * scale);
        } else {
            // Fallback shape
            ctx.fillStyle = b.state === 'charging' ? 'purple' : 'red';
            ctx.fillRect(-20 * scale, -20 * scale, 40 * scale, 40 * scale);
        }
        ctx.restore();
    }

    // Warning
    if (showWarning) {
        ctx.globalAlpha = warningTimer / 120; 
        ctx.fillStyle = '#ffffff';
        ctx.font = '28px "Determination", monospace'; 
        ctx.textAlign = 'center';
        ctx.fillText("DON'T HIDE FROM ME.", canvas.width / 2, 440); 
        ctx.globalAlpha = 1.0; 
    }

    // Player
    if (playerImg.complete && playerImg.naturalWidth > 0) {
        if (player.invulnerableTimer <= 0 || Math.floor(Date.now() / 50) % 2 === 0) {
            ctx.drawImage(playerImg, player.x - 16, player.y - 16, 32, 32);
        }
    } else {
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Fireballs
    for (let p of projectiles) {
        if (fireBallImg.complete && fireBallImg.naturalWidth > 0) {
            ctx.drawImage(fireBallImg, p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
        } else {
            ctx.fillStyle = '#ff9800';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // UI
    ctx.fillStyle = '#fff';
    ctx.font = '24px "Determination", monospace'; 
    ctx.textAlign = 'left';
    ctx.fillText("RUSSOLINI'S CRINGE:", 50, 50);
    
    ctx.fillStyle = '#555';
    ctx.fillRect(50, 70, 200, 20);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(50, 70, (player.hp / player.maxHp) * 200, 20);

    // Game Over
    if (gameState === 'gameover') {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '40px "Hachicro", monospace'; 
        ctx.textAlign = 'center';
        ctx.fillText("Leave them alone.", canvas.width/2, canvas.height/2);
    }
}

gameLoop();