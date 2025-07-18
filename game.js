class MatrixBreakout {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        this.gameState = 'start';
        this.score = 0;
        this.level = 1;
        this.lives = 3;
        
        this.paddle = {
            x: this.width / 2 - 60,
            y: this.height - 40,
            width: 120,
            height: 15,
            speed: 20,
            dx: 0
        };
        
        this.ball = {
            x: this.width / 2,
            y: this.height / 2,
            radius: 8,
            dx: 4,
            dy: -4,
            speed: 4,
            trail: []
        };
        
        this.bricks = [];
        this.particles = [];
        this.stars = [];
        this.matrixChars = [];
        this.powerUps = [];
        
        this.keys = {};
        this.sounds = {};
        this.speedMultiplier = 1;
        this.basePaddleSpeed = 20;
        this.baseBallSpeed = 4;
        
        this.poseTracking = {
            enabled: false,
            pose: null,
            camera: null,
            bodyPosition: null,
            smoothingFactor: 0.2,
            landmarksCanvas: null,
            landmarksCtx: null,
            lastPoseDetected: Date.now(),
            poseLostBuzzPlayed: false
        };
        
        this.init();
    }
    
    init() {
        this.createStarfield();
        this.createMatrixRain();
        this.createBricks();
        this.bindEvents();
        this.initSounds();
        this.initPoseTracking();
        this.gameLoop();
    }
    
    createStarfield() {
        for (let i = 0; i < 100; i++) {
            this.stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 0.5 + 0.2,
                opacity: Math.random()
            });
        }
    }
    
    createMatrixRain() {
        const chars = '0123456789ABCDEF';
        for (let i = 0; i < 50; i++) {
            this.matrixChars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                char: chars[Math.floor(Math.random() * chars.length)],
                speed: Math.random() * 2 + 1,
                opacity: Math.random() * 0.5 + 0.2
            });
        }
    }
    
    createBricks() {
        this.bricks = [];
        const rows = 6;
        const cols = 10;
        const brickWidth = 70;
        const brickHeight = 25;
        const padding = 5;
        const offsetTop = 80;
        const offsetLeft = (this.width - (cols * (brickWidth + padding) - padding)) / 2;
        
        const colors = [
            '#ff0080', '#ff4000', '#ff8000', '#ffff00', '#80ff00', '#00ff80'
        ];
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                this.bricks.push({
                    x: offsetLeft + col * (brickWidth + padding),
                    y: offsetTop + row * (brickHeight + padding),
                    width: brickWidth,
                    height: brickHeight,
                    color: colors[row],
                    points: (rows - row) * 10,
                    visible: true,
                    hp: row < 2 ? 2 : 1
                });
            }
        }
    }
    
    bindEvents() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if (e.key === ' ') {
                e.preventDefault();
                this.togglePause();
            }
            
            // Speed control with number keys 1-9
            if (e.key >= '1' && e.key <= '9') {
                this.setSpeed(parseInt(e.key));
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
        
        document.getElementById('start-btn').addEventListener('click', () => {
            this.startGame();
        });
        
        document.getElementById('restart-btn').addEventListener('click', () => {
            this.restartGame();
        });
    }
    
    setSpeed(level) {
        // Speed levels 1-9, where 1 is slowest and 9 is fastest
        this.speedMultiplier = level * 0.3; // 0.3 to 2.7 multiplier
        this.paddle.speed = this.basePaddleSpeed * this.speedMultiplier;
        this.ball.speed = this.baseBallSpeed * this.speedMultiplier;
        
        // Update current ball velocity while maintaining direction
        const currentSpeed = Math.sqrt(this.ball.dx * this.ball.dx + this.ball.dy * this.ball.dy);
        if (currentSpeed > 0) {
            const ratio = this.ball.speed / currentSpeed;
            this.ball.dx *= ratio;
            this.ball.dy *= ratio;
        }
    }
    
    initSounds() {
        this.sounds = {
            paddle: this.createSound(200, 0.1, 'square'),
            brick: this.createSound(400, 0.15, 'sawtooth'),
            powerUp: this.createSound(600, 0.2, 'sine'),
            gameOver: this.createSound(150, 0.5, 'triangle'),
            buzz: this.createSound(100, 0.3, 'square')
        };
    }
    
    async initPoseTracking() {
        try {
            const videoElement = document.getElementById('webcam');
            const cameraDisplay = document.getElementById('camera-display');
            
            // Initialize landmarks canvas
            this.poseTracking.landmarksCanvas = document.getElementById('landmarks-canvas');
            this.poseTracking.landmarksCtx = this.poseTracking.landmarksCanvas.getContext('2d');
            
            this.poseTracking.pose = new Pose({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
                }
            });
            
            this.poseTracking.pose.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                smoothSegmentation: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            
            this.poseTracking.pose.onResults((results) => {
                this.onPoseResults(results);
            });
            
            this.poseTracking.camera = new Camera(videoElement, {
                onFrame: async () => {
                    await this.poseTracking.pose.send({image: videoElement});
                },
                width: 640,
                height: 480
            });
            
            await this.poseTracking.camera.start();
            this.poseTracking.enabled = true;
            
            // Stream webcam to camera preview
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                cameraDisplay.srcObject = stream;
            }
            
        } catch (error) {
            console.log('Pose tracking initialization failed:', error);
        }
    }
    
    onPoseResults(results) {
        // Clear the landmarks canvas
        if (this.poseTracking.landmarksCtx) {
            this.poseTracking.landmarksCtx.clearRect(0, 0, this.poseTracking.landmarksCanvas.width, this.poseTracking.landmarksCanvas.height);
        }
        
        if (results.poseLandmarks && results.poseLandmarks.length > 0) {
            const landmarks = results.poseLandmarks;
            
            // Pose is detected, update tracking
            this.poseTracking.lastPoseDetected = Date.now();
            this.poseTracking.poseLostBuzzPlayed = false;
            
            // Calculate body center using shoulders for better stability
            const bodyCenter = this.calculateBodyCenter(landmarks);
            const normalizedX = bodyCenter.x;
            const gameX = normalizedX * this.width;
            
            if (this.poseTracking.bodyPosition === null) {
                this.poseTracking.bodyPosition = gameX;
            } else {
                this.poseTracking.bodyPosition = this.poseTracking.bodyPosition * (1 - this.poseTracking.smoothingFactor) + 
                    gameX * this.poseTracking.smoothingFactor;
            }
            
            // Check for arms up gesture for game restart
            if (this.gameState === 'gameOver') {
                const isArmsUp = this.detectArmsUp(landmarks);
                if (isArmsUp) {
                    this.restartGame();
                }
            }
            
            // Draw pose landmarks
            this.drawPoseLandmarks(landmarks);
        } else {
            // No pose detected
            if (this.poseTracking.enabled && !this.poseTracking.poseLostBuzzPlayed) {
                const timeSinceLastDetected = Date.now() - this.poseTracking.lastPoseDetected;
                if (timeSinceLastDetected > 1000) { // 1 second delay
                    this.sounds.buzz();
                    this.poseTracking.poseLostBuzzPlayed = true;
                }
            }
        }
    }
    
    calculateBodyCenter(landmarks) {
        // Use shoulders and hips to calculate body center for stable tracking
        const leftShoulder = landmarks[11];  // Left shoulder
        const rightShoulder = landmarks[12]; // Right shoulder
        const leftHip = landmarks[23];       // Left hip
        const rightHip = landmarks[24];      // Right hip
        
        // Calculate center between shoulders and hips
        const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
        const hipCenterX = (leftHip.x + rightHip.x) / 2;
        
        // Use upper body center (shoulders) for paddle control
        return {
            x: shoulderCenterX,
            y: (leftShoulder.y + rightShoulder.y) / 2
        };
    }
    
    detectArmsUp(landmarks) {
        // Check if both arms are raised up (wrists above shoulders)
        const leftWrist = landmarks[15];     // Left wrist
        const rightWrist = landmarks[16];    // Right wrist
        const leftShoulder = landmarks[11];  // Left shoulder
        const rightShoulder = landmarks[12]; // Right shoulder
        
        // Check if wrists are above shoulders
        const leftArmUp = leftWrist.y < leftShoulder.y - 0.1;
        const rightArmUp = rightWrist.y < rightShoulder.y - 0.1;
        
        return leftArmUp && rightArmUp;
    }
    
    drawPoseLandmarks(landmarks) {
        if (!this.poseTracking.landmarksCtx) return;
        
        const ctx = this.poseTracking.landmarksCtx;
        const canvasWidth = this.poseTracking.landmarksCanvas.width;
        const canvasHeight = this.poseTracking.landmarksCanvas.height;
        
        // Pose connections (MediaPipe pose model)
        const connections = [
            // Upper body
            [11, 12], [11, 13], [12, 14], [13, 15], [14, 16], // Shoulders and arms
            [11, 23], [12, 24], [23, 24], // Torso
            // Lower body
            [23, 25], [24, 26], [25, 27], [26, 28], // Hips and legs
            [27, 29], [28, 30], [29, 31], [30, 32], // Knees and ankles
            // Face (optional)
            [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8]
        ];
        
        // Draw connections
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.8;
        
        connections.forEach(([start, end]) => {
            if (landmarks[start] && landmarks[end]) {
                const startPoint = landmarks[start];
                const endPoint = landmarks[end];
                
                const startX = startPoint.x * canvasWidth;
                const startY = startPoint.y * canvasHeight;
                const endX = endPoint.x * canvasWidth;
                const endY = endPoint.y * canvasHeight;
                
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }
        });
        
        // Draw landmarks
        ctx.fillStyle = '#00ff00';
        ctx.globalAlpha = 1;
        
        landmarks.forEach((landmark, index) => {
            const x = landmark.x * canvasWidth;
            const y = landmark.y * canvasHeight;
            
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();
            
            // Add a white center dot
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = '#00ff00';
        });
    }
    
    createSound(frequency, duration, type = 'sine') {
        return () => {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = frequency;
            oscillator.type = type;
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + duration);
        };
    }
    
    startGame() {
        this.gameState = 'playing';
        document.getElementById('start-screen').classList.add('hidden');
        this.resetBall();
    }
    
    restartGame() {
        this.score = 0;
        this.level = 1;
        this.lives = 3;
        this.createBricks();
        this.gameState = 'playing';
        document.getElementById('game-over-screen').classList.add('hidden');
        this.resetBall();
        this.updateHUD();
    }
    
    togglePause() {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
            document.getElementById('pause-screen').classList.remove('hidden');
        } else if (this.gameState === 'paused') {
            this.gameState = 'playing';
            document.getElementById('pause-screen').classList.add('hidden');
        }
    }
    
    resetBall() {
        this.ball.x = this.width / 2;
        this.ball.y = this.height / 2;
        this.ball.dx = (Math.random() > 0.5 ? 1 : -1) * this.ball.speed;
        this.ball.dy = -this.ball.speed;
        this.ball.trail = [];
    }
    
    updateHUD() {
        document.getElementById('score-value').textContent = this.score;
        document.getElementById('level-value').textContent = this.level;
        document.getElementById('lives-value').textContent = this.lives;
        
        // Update overlay HUD
        document.getElementById('score-value-overlay').textContent = this.score;
        document.getElementById('level-value-overlay').textContent = this.level;
        document.getElementById('lives-value-overlay').textContent = this.lives;
    }
    
    update() {
        if (this.gameState !== 'playing') return;
        
        this.updatePaddle();
        this.updateBall();
        this.updateParticles();
        this.updateStars();
        this.updateMatrixRain();
        this.checkCollisions();
        this.checkGameState();
    }
    
    updatePaddle() {
        this.paddle.dx = 0;
        
        if (this.poseTracking.enabled && this.poseTracking.bodyPosition !== null) {
            const flippedX = this.width - this.poseTracking.bodyPosition;
            const targetX = flippedX - this.paddle.width / 2;
            this.paddle.x = Math.max(0, Math.min(targetX, this.width - this.paddle.width));
        } else {
            if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) {
                this.paddle.dx = -this.paddle.speed;
            }
            if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) {
                this.paddle.dx = this.paddle.speed;
            }
            
            this.paddle.x += this.paddle.dx;
            
            if (this.paddle.x < 0) this.paddle.x = 0;
            if (this.paddle.x + this.paddle.width > this.width) {
                this.paddle.x = this.width - this.paddle.width;
            }
        }
    }
    
    updateBall() {
        this.ball.trail.push({x: this.ball.x, y: this.ball.y});
        if (this.ball.trail.length > 10) this.ball.trail.shift();
        
        this.ball.x += this.ball.dx;
        this.ball.y += this.ball.dy;
        
        if (this.ball.x <= this.ball.radius || this.ball.x >= this.width - this.ball.radius) {
            this.ball.dx = -this.ball.dx;
            this.createImpactParticles(this.ball.x, this.ball.y);
        }
        
        if (this.ball.y <= this.ball.radius) {
            this.ball.dy = -this.ball.dy;
            this.createImpactParticles(this.ball.x, this.ball.y);
        }
        
        if (this.ball.y > this.height) {
            this.lives--;
            if (this.lives <= 0) {
                this.gameOver();
            } else {
                this.resetBall();
            }
            this.updateHUD();
        }
    }
    
    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.x += particle.dx;
            particle.y += particle.dy;
            particle.life -= 0.02;
            
            if (particle.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }
    
    updateStars() {
        this.stars.forEach(star => {
            star.y += star.speed;
            if (star.y > this.height) {
                star.y = -star.size;
                star.x = Math.random() * this.width;
            }
        });
    }
    
    updateMatrixRain() {
        this.matrixChars.forEach(char => {
            char.y += char.speed;
            if (char.y > this.height) {
                char.y = -20;
                char.x = Math.random() * this.width;
            }
        });
    }
    
    checkCollisions() {
        if (this.ball.y + this.ball.radius > this.paddle.y &&
            this.ball.x > this.paddle.x &&
            this.ball.x < this.paddle.x + this.paddle.width) {
            
            const hitPos = (this.ball.x - this.paddle.x) / this.paddle.width;
            const angle = (hitPos - 0.5) * Math.PI / 3;
            const speed = Math.sqrt(this.ball.dx * this.ball.dx + this.ball.dy * this.ball.dy);
            
            this.ball.dx = speed * Math.sin(angle);
            this.ball.dy = -speed * Math.cos(angle);
            
            this.sounds.paddle();
            this.createImpactParticles(this.ball.x, this.paddle.y);
        }
        
        for (let i = this.bricks.length - 1; i >= 0; i--) {
            const brick = this.bricks[i];
            if (!brick.visible) continue;
            
            if (this.ball.x + this.ball.radius > brick.x &&
                this.ball.x - this.ball.radius < brick.x + brick.width &&
                this.ball.y + this.ball.radius > brick.y &&
                this.ball.y - this.ball.radius < brick.y + brick.height) {
                
                this.ball.dy = -this.ball.dy;
                brick.hp--;
                
                if (brick.hp <= 0) {
                    brick.visible = false;
                    this.score += brick.points;
                    this.createBrickParticles(brick);
                    this.sounds.brick();
                    
                    if (Math.random() < 0.1) {
                        this.createPowerUp(brick.x + brick.width / 2, brick.y + brick.height / 2);
                    }
                }
                
                this.updateHUD();
                break;
            }
        }
    }
    
    createImpactParticles(x, y) {
        for (let i = 0; i < 8; i++) {
            this.particles.push({
                x: x,
                y: y,
                dx: (Math.random() - 0.5) * 4,
                dy: (Math.random() - 0.5) * 4,
                life: 1,
                color: '#00ffff',
                size: Math.random() * 3 + 1
            });
        }
    }
    
    createBrickParticles(brick) {
        for (let i = 0; i < 15; i++) {
            this.particles.push({
                x: brick.x + brick.width / 2,
                y: brick.y + brick.height / 2,
                dx: (Math.random() - 0.5) * 6,
                dy: (Math.random() - 0.5) * 6,
                life: 1,
                color: brick.color,
                size: Math.random() * 4 + 2
            });
        }
    }
    
    createPowerUp(x, y) {
        this.powerUps.push({
            x: x,
            y: y,
            type: 'expand',
            collected: false
        });
    }
    
    checkGameState() {
        const visibleBricks = this.bricks.filter(brick => brick.visible);
        if (visibleBricks.length === 0) {
            this.level++;
            this.createBricks();
            this.ball.speed += 0.5;
            this.resetBall();
            this.updateHUD();
        }
    }
    
    gameOver() {
        this.gameState = 'gameOver';
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('game-over-screen').classList.remove('hidden');
        this.sounds.gameOver();
    }
    
    render() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.renderStars();
        this.renderMatrixRain();
        this.renderBricks();
        this.renderPaddle();
        this.renderBall();
        this.renderParticles();
        this.renderPowerUps();
    }
    
    renderStars() {
        this.stars.forEach(star => {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
            this.ctx.fillRect(star.x, star.y, star.size, star.size);
        });
    }
    
    renderMatrixRain() {
        this.ctx.font = '14px Orbitron';
        this.matrixChars.forEach(char => {
            this.ctx.fillStyle = `rgba(0, 255, 0, ${char.opacity})`;
            this.ctx.fillText(char.char, char.x, char.y);
        });
    }
    
    renderBricks() {
        this.bricks.forEach(brick => {
            if (!brick.visible) return;
            
            const gradient = this.ctx.createLinearGradient(
                brick.x, brick.y, brick.x + brick.width, brick.y + brick.height
            );
            gradient.addColorStop(0, brick.color);
            gradient.addColorStop(1, '#000');
            
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
            
            this.ctx.strokeStyle = brick.color;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
            
            if (brick.hp > 1) {
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '12px Orbitron';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(brick.hp, brick.x + brick.width / 2, brick.y + brick.height / 2 + 4);
            }
        });
    }
    
    renderPaddle() {
        const gradient = this.ctx.createLinearGradient(
            this.paddle.x, this.paddle.y, this.paddle.x + this.paddle.width, this.paddle.y + this.paddle.height
        );
        gradient.addColorStop(0, '#00ffff');
        gradient.addColorStop(0.5, '#0080ff');
        gradient.addColorStop(1, '#0040ff');
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height);
        
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height);
    }
    
    renderBall() {
        this.ball.trail.forEach((point, index) => {
            const alpha = index / this.ball.trail.length * 0.5;
            this.ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, this.ball.radius * (index / this.ball.trail.length), 0, Math.PI * 2);
            this.ctx.fill();
        });
        
        const gradient = this.ctx.createRadialGradient(
            this.ball.x, this.ball.y, 0, this.ball.x, this.ball.y, this.ball.radius
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.7, '#00ffff');
        gradient.addColorStop(1, '#0080ff');
        
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
    
    renderParticles() {
        this.particles.forEach(particle => {
            this.ctx.fillStyle = `rgba(${this.hexToRgb(particle.color)}, ${particle.life})`;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
    
    renderPowerUps() {
        this.powerUps.forEach(powerUp => {
            if (powerUp.collected) return;
            
            this.ctx.fillStyle = '#ffff00';
            this.ctx.beginPath();
            this.ctx.arc(powerUp.x, powerUp.y, 10, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#ff8000';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        });
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? 
            `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
            '255, 255, 255';
    }
    
    gameLoop() {
        this.update();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MatrixBreakout();
});