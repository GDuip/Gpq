// Import Three.js (assuming module usage, adjust if using global script include)
import * as THREE from 'three';
// Optional: Import loaders and controls if needed later
// import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// --- Game State Constants ---
const TITLE = 0;
const LOADING = 1; // Added state for asset loading
const PLAYING = 2;
const PAUSED = 3;
const GAME_OVER = 4;
const WAVE_TRANSITION = 5;

class GameEngine3D {
    // --- Configuration ---
    static enemyTypes = { // Keep definitions, but visuals/behavior handled in Enemy.js
        basic: { health: 15, score: 1, collisionDamage: 30, speed: 2, size: 1, dropChance: 0.05 }, // Size is now in 3D units
        tank: { health: 25, score: 2, collisionDamage: 38, speed: 1.5, size: 1.5, dropChance: 0.10 },
        fast: { health: 10, score: 1.5, collisionDamage: 18, speed: 3, size: 0.8, dropChance: 0.08 },
        shooter: { health: 20, score: 3, collisionDamage: 15, speed: 1.8, size: 1, canShoot: true, shootingInterval: 2000, chaseDistance: 20, shootDistance: 15, dropChance: 0.15 } // Distances in 3D units
    };
    static powerUpTypes = { // Keep definitions
        heal: { duration: 0, effect: (player) => player.heal(25) },
        speed: { duration: 5000, effect: (player) => player.applySpeedBoost(1.5), removeEffect: (player) => player.removeSpeedBoost(1.5) },
        shield: { duration: 7000, effect: (player) => player.activateShield(), removeEffect: (player) => player.deactivateShield() }
    };

    constructor(canvasId = 'webglCanvas', gameInfoId = 'gameInfo', gameOverId = 'gameOverScreen') {
        // --- Core 3D Components ---
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas element with ID "${canvasId}" not found.`);
        }
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75, // Field of View (FOV)
            window.innerWidth / window.innerHeight, // Aspect Ratio
            0.1, // Near clipping plane
            1000 // Far clipping plane
        );
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        // Optional: Enable shadow mapping
        // this.renderer.shadowMap.enabled = true;
        // this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

        // --- Basic Lighting ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Soft white light
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7.5);
        // Optional: Configure shadows for the light
        // directionalLight.castShadow = true;
        // directionalLight.shadow.mapSize.width = 1024;
        // directionalLight.shadow.mapSize.height = 1024;
        this.scene.add(directionalLight);

        // --- Timing & Debug ---
        this.clock = new THREE.Clock(); // For delta time calculation
        this.lastTimestamp = 0; // For manual FPS calculation if needed
        this.devMode = new URLSearchParams(window.location.search).get('dev') === 'true';
        this.fps = 0;

        // --- UI Elements ---
        this.gameInfoElem = document.getElementById(gameInfoId);
        this.gameOverElem = document.getElementById(gameOverId);
        this.restartButton = this.gameOverElem?.querySelector('#restartButton'); // Use optional chaining
        this.finalScoreElem = document.getElementById('finalScore');
        this.finalWaveElem = document.getElementById('finalWave');
        if (this.restartButton) {
            this.restartButton.addEventListener('click', () => this.transitionToGame());
        } else if (this.gameOverElem) {
            console.warn("Restart button with ID '#restartButton' not found within gameOverScreen.");
        }

        // --- Input State ---
        this.keys = {}; // Keyboard state
        this.mouse = { x: 0, y: 0, buttons: { left: false, right: false, middle: false } }; // Normalized mouse coords & buttons
        this.inputState = { // Abstracted actions (to be populated by input handlers)
             forward: false, backward: false, left: false, right: false, jump: false, shoot: false,
             aimDelta: { x: 0, y: 0 } // For mouse look delta
        };
        this.isPointerLocked = false; // Track Pointer Lock state for mouse look

        // --- Game State ---
        this.gameState = TITLE;
        this.score = 0;
        this.currentWave = 0;
        this.enemiesToSpawn = 0;
        this.enemiesRemainingInWave = 0;
        this.enemiesActive = 0;
        this.waveCooldownTimer = 0;
        this.waveCooldownDuration = 3000; // ms
        this.transition = null; // For potential UI fades (not 3D scene fades here)

        // --- Entity Management ---
        // These will hold instances of your Player, Enemy, Bullet classes
        this.player = null; // Will be created later
        this.activeEnemies = [];
        this.activeBullets = [];
        this.activePowerUps = [];
        this.activeEffects = []; // For non-pooled effects like explosions

        // --- Object Pools (Concept remains valid) ---
        this.pools = {
            enemies: [],
            bullets: [],
            // Damage numbers might be HTML overlays or 3D text (more complex)
            powerUps: []
        };

        // --- Asset Loading ---
        this.loadingManager = new THREE.LoadingManager();
        this.textureLoader = new THREE.TextureLoader(this.loadingManager);
        // this.gltfLoader = new GLTFLoader(this.loadingManager); // Initialize if using GLTF
        this.assetsLoaded = false;
        this.assetsToLoad = 0; // Track number of assets
        this.assetsLoadedCount = 0;
        this.setupLoadingManager();

        // --- Physics Placeholder ---
        // In a real game, you'd initialize a physics engine here (e.g., Cannon-es, Rapier)
        // and link it to Three.js objects. For now, we'll use simple bounding box checks.

        console.log("GameEngine3D Initialized");
    }

    setupLoadingManager() {
        this.loadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
            console.log(`Started loading assets...`);
            this.gameState = LOADING;
            // Optional: Show loading UI
        };
        this.loadingManager.onLoad = () => {
            console.log("All assets loaded successfully.");
            this.assetsLoaded = true;
            if (this.gameState === LOADING) {
                // Potentially transition automatically, or wait for user input
                this.gameState = TITLE; // Move to title screen after loading
                this.updateGameInfoDisplay(); // Hide loading text if any
            }
        };
        this.loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
            console.log(`Loading asset: ${url}. Loaded ${itemsLoaded} of ${itemsTotal}.`);
            const progress = (itemsLoaded / itemsTotal) * 100;
            // Optional: Update loading UI progress bar/text
             if(this.gameInfoElem && this.gameState === LOADING) {
                this.gameInfoElem.style.display = 'block';
                this.gameInfoElem.textContent = `Loading... ${progress.toFixed(0)}%`;
             }
        };
        this.loadingManager.onError = (url) => {
            console.error(`Error loading asset: ${url}`);
            // Optional: Show error message to user
        };
    }

    // --- Asset Preloading ---
    async preloadAssets() {
        console.log("Preloading assets...");
        this.assetsLoaded = false;
        this.gameState = LOADING;
        this.updateGameInfoDisplay();

        // Example: Define assets to load
        // this.assetsToLoad = 3; // Set the total count for the progress manager
        // const playerModelPromise = this.gltfLoader.loadAsync('assets/models/player.glb');
        // const enemyTexturePromise = this.textureLoader.loadAsync('assets/textures/enemy_basic.png');
        // const groundTexturePromise = this.textureLoader.loadAsync('assets/textures/ground.jpg');

        try {
             // Use Promise.all to wait for all loaders managed by the LoadingManager
             // The manager handles the count automatically if loaders are registered with it.
             // If you have manual async loads outside the manager, handle them here.
             // await Promise.all([playerModelPromise, enemyTexturePromise, groundTexturePromise]);

            // --- TEMPORARY Placeholder ---
            // Simulate loading delay if no actual assets yet
            await new Promise(resolve => setTimeout(resolve, 50));
            // --- End Placeholder ---

            // Note: LoadingManager.onLoad will fire when all managed assets are done.
            // This function might just initiate the loads.
             console.log("Asset loading initiated.");


        } catch (error) {
            console.error("Asset preloading failed:", error);
            // Handle critical loading failure
        }
    }

    // --- Player Creation ---
    createPlayer() {
        // This should instantiate your Player class (defined in Player.js)
        // which internally creates its Three.js mesh and adds it to the scene.
        // Example:
        // this.player = new Player(this); // Pass engine reference
        // this.scene.add(this.player.mesh);

        // --- Placeholder Player ---
        const geometry = new THREE.BoxGeometry(0.8, 1.8, 0.8); // Simple capsule-like box
        const material = new THREE.MeshStandardMaterial({ color: 0x0077ff });
        const placeholderMesh = new THREE.Mesh(geometry, material);
        placeholderMesh.position.set(0, 0.9, 0); // Position base at ground level
        // placeholderMesh.castShadow = true; // Optional shadows
        this.player = {
            mesh: placeholderMesh, // The 3D object
            health: 100,
            maxHealth: 100,
            speed: 5, // Units per second
            isInvincible: false,
            invincibilityTimer: 0,
            boundingBox: new THREE.Box3(), // For collision detection
            velocity: new THREE.Vector3(), // For potential physics integration later
            direction: new THREE.Vector3(0,0,-1), // Forward direction
            config: { size: 1.8 }, // Approximate height for now

            update: (dt, inputState, engine) => {
                // Movement logic using inputState and dt
                const moveSpeed = this.speed * dt;
                const moveDirection = new THREE.Vector3();

                if (inputState.forward) moveDirection.z -= 1;
                if (inputState.backward) moveDirection.z += 1;
                if (inputState.left) moveDirection.x -= 1;
                if (inputState.right) moveDirection.x += 1;

                // Apply rotation based on camera/mouse look (if implemented)
                 // This requires getting camera direction. For now, assume player faces Z-.
                 // Example with basic camera following:
                 // moveDirection.applyQuaternion(engine.camera.quaternion); // Apply camera rotation to movement

                moveDirection.normalize().multiplyScalar(moveSpeed);

                 // Simple collision placeholder (prevent moving outside a basic area)
                 const nextPos = this.mesh.position.clone().add(moveDirection);
                 const playArea = 50; // Example boundary
                 if (Math.abs(nextPos.x) < playArea && Math.abs(nextPos.z) < playArea) {
                     this.mesh.position.add(moveDirection);
                 }


                // Update bounding box for collision
                this.boundingBox.setFromObject(this.mesh);

                // Update direction vector (important for shooting)
                 // This should ideally be controlled by mouse look
                 // For now, it might just update based on movement keys if no mouse look
                 if (moveDirection.lengthSq() > 0.001) { // If moving
                     // This simplistic direction update might not be ideal for FPS style
                     // this.direction.copy(moveDirection.normalize());
                 }


                 // Update invincibility timer
                 if (this.isInvincible) {
                      this.invincibilityTimer -= dt * 1000;
                      if (this.invincibilityTimer <= 0) this.isInvincible = false;
                 }
            },
            takeDamage: (amount) => {
                if(this.isInvincible) return;
                this.health = Math.max(0, this.health - amount);
                console.log(`Player took ${amount} damage, health: ${this.health}`);
                 this.applyInvincibility(1000); // 1 second invincibility
                if(this.health <= 0) {
                    engine.endGame(); // Use engine reference
                }
            },
             applyInvincibility: (duration) => {
                 this.isInvincible = true;
                 this.invincibilityTimer = duration;
             },
             // Other methods like heal, applySpeedBoost etc. would go here
        };
        this.scene.add(this.player.mesh);
        console.log("Placeholder Player created.");
        // --- End Placeholder ---
    }

    // --- Input Handling ---
    setupInputListeners() {
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        window.addEventListener('resize', () => this.resizeCanvas());

        // Mouse Look (Requires Pointer Lock)
        this.canvas.addEventListener('click', () => {
            if (!this.isPointerLocked && this.gameState === PLAYING) {
                this.canvas.requestPointerLock().catch(err => {
                    console.warn("Cannot request pointer lock:", err);
                });
            }
        });

        document.addEventListener('pointerlockchange', () => {
             this.isPointerLocked = document.pointerLockElement === this.canvas;
             console.log("Pointer Lock:", this.isPointerLocked);
             // Reset mouse delta accumulation when lock changes
             this.inputState.aimDelta.x = 0;
             this.inputState.aimDelta.y = 0;
        }, false);

        document.addEventListener('mousemove', (e) => this.handleMouseMove(e), false);
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    }

    handleKeyDown(e) {
        this.keys[e.code] = true; // Use e.code for layout independence
        // Check for pause key etc. based on game state
        if (e.code === 'KeyP' && (this.gameState === PLAYING || this.gameState === PAUSED)) this.togglePause();
        if (e.code === 'Enter') {
            if (this.gameState === TITLE && this.assetsLoaded) this.transitionToGame();
            else if (this.gameState === GAME_OVER) this.transitionToGame();
        }
         if (e.code === 'Escape' && this.isPointerLocked) {
            document.exitPointerLock();
        }
    }

    handleKeyUp(e) {
        this.keys[e.code] = false;
    }

     handleMouseMove(e) {
        if (this.isPointerLocked) {
             // Accumulate movement delta for processing in the update loop
            this.inputState.aimDelta.x += e.movementX || 0;
            this.inputState.aimDelta.y += e.movementY || 0;
        } else {
             // Could update normalized mouse coords if needed for UI
             const rect = this.canvas.getBoundingClientRect();
             this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
             this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        }
     }

    handleMouseDown(e) {
        if (this.isPointerLocked && this.gameState === PLAYING) {
             this.mouse.buttons.left = e.button === 0; // Primary button often shoot
             this.mouse.buttons.right = e.button === 2;
             // Trigger shoot action immediately if needed
             if(this.mouse.buttons.left) this.inputState.shoot = true; // Set action state
        }
    }
     handleMouseUp(e) {
          if (this.isPointerLocked) {
             if(e.button === 0) this.mouse.buttons.left = false;
             if(e.button === 2) this.mouse.buttons.right = false;
              // Could reset shoot action state here if needed
             if(!this.mouse.buttons.left) this.inputState.shoot = false;
          }
     }


    // --- Input State Update (Call this at start of update loop) ---
    updateInputState() {
        this.inputState.forward = !!(this.keys['KeyW'] || this.keys['ArrowUp']);
        this.inputState.backward = !!(this.keys['KeyS'] || this.keys['ArrowDown']);
        this.inputState.left = !!(this.keys['KeyA'] || this.keys['ArrowLeft']);
        this.inputState.right = !!(this.keys['KeyD'] || this.keys['ArrowRight']);
        this.inputState.jump = !!this.keys['Space']; // Example jump key

        // Shoot can be triggered by mouse or keyboard
        this.inputState.shoot = !!(this.keys['Space'] || this.mouse.buttons.left); // Re-evaluate based on current state

        // --- Process Accumulated Mouse Look ---
         if (this.isPointerLocked && this.player) {
             const lookSensitivity = 0.002; // Adjust sensitivity
             const deltaX = this.inputState.aimDelta.x * lookSensitivity;
             const deltaY = this.inputState.aimDelta.y * lookSensitivity;

             // Rotate player mesh around Y axis (horizontal look)
             this.player.mesh.rotateY(-deltaX);

             // Rotate camera around X axis (vertical look) - Clamp to prevent flipping
             const currentXRot = this.camera.rotation.x;
             const desiredXRot = currentXRot - deltaY;
             this.camera.rotation.x = THREE.MathUtils.clamp(desiredXRot, -Math.PI / 2, Math.PI / 2);

            // Update player's forward direction based on its rotation
            this.player.mesh.getWorldDirection(this.player.direction);

         }
         // Reset accumulated delta for the next frame
         this.inputState.aimDelta.x = 0;
         this.inputState.aimDelta.y = 0;
    }


    // --- Game Loop ---
    gameLoop(timestamp) {
        const dt = this.clock.getDelta(); // Time since last frame in seconds

        // Calculate FPS (optional)
        // this.fps = Math.round(1 / dt);

        this.updateInputState(); // Update abstracted actions based on raw input

        // --- State-Based Updates ---
        switch (this.gameState) {
            case LOADING:
                // Handled by LoadingManager, maybe show progress
                break;
            case TITLE:
                // Maybe animate title screen elements (usually HTML/CSS)
                break;
            case PLAYING:
                this.updateEntities(dt);
                this.handleCollisions(); // Basic collision checks
                this.cleanupEntities();
                this.updateGameState(dt); // Check for wave end etc.
                this.updateCamera(); // Keep camera following player
                break;
            case PAUSED:
                // Do nothing, effectively pausing updates
                break;
            case WAVE_TRANSITION:
                 this.updateEntities(dt, true); // Update passive things maybe? Or just player?
                 this.cleanupEntities();
                 this.updateGameState(dt); // Decrement timer
                 this.updateCamera();
                break;
            case GAME_OVER:
                // Stop updates, handled by HTML overlay
                break;
        }

        // --- Rendering ---
        this.renderer.render(this.scene, this.camera);

        // Request next frame
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }

    // --- Update Phases ---
    updateEntities(dt, isTransition = false) {
         // Update Player (if exists and game is playing/transitioning)
         if (this.player && (this.gameState === PLAYING || isTransition)) {
             this.player.update(dt, this.inputState, this); // Pass input state and engine ref
         }

        // Only update other entities if strictly playing
        if (this.gameState === PLAYING) {
            this.activeEnemies.forEach(e => e.update(dt));
            this.activeBullets.forEach(b => b.update(dt));
            this.activePowerUps.forEach(p => p.update(dt));
            this.activeEffects.forEach(fx => fx.update(dt)); // Update particle effects etc.
        }
    }

    updateCamera() {
        if (!this.player) return;

         // Simple third-person follow camera
         const offset = new THREE.Vector3(0, 5, 10); // Behind and above
         // Apply the player's rotation to the offset
         offset.applyQuaternion(this.player.mesh.quaternion);
         // Calculate desired camera position
         const desiredPosition = this.player.mesh.position.clone().add(offset);

         // Smoothly interpolate camera position (lerp)
         const lerpFactor = 0.1; // Adjust for faster/slower follow
         this.camera.position.lerp(desiredPosition, lerpFactor);

         // Make the camera look at the player's approximate head position
         const lookAtPosition = this.player.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)); // Look slightly above base
         this.camera.lookAt(lookAtPosition);

        // // Alternative: First-person camera (attach camera to player mesh)
        // // You'd typically add the camera to the player mesh in createPlayer()
        // // Example: this.player.mesh.add(this.camera);
        // // Then set camera's local position: this.camera.position.set(0, 1.6, 0.2); // Eye level
        // // Player mesh rotation handled by mouse look would rotate the camera automatically.
    }


    handleCollisions() {
        if (!this.player) return;

        // --- Basic Bounding Box Collision Checks ---
        // Note: This is very basic. A physics engine (Cannon-es, Rapier) is highly recommended for 3D.

        const playerBox = this.player.boundingBox; // Assuming player updates its box

        // 1. Player Bullets vs Enemies
        this.activeBullets.forEach(bullet => {
            if (!bullet.isPlayerBullet || bullet._destroyed) return;
            const bulletBox = bullet.boundingBox; // Assuming bullet updates its box
            this.activeEnemies.forEach(enemy => {
                if (enemy._destroyed || enemy.isInvincible) return;
                const enemyBox = enemy.boundingBox; // Assuming enemy updates its box
                if (bulletBox.intersectsBox(enemyBox)) {
                    console.log("Player bullet hit enemy");
                    const damageDealt = enemy.takeDamage(bullet.damage); // Enemy handles damage logic
                    // Optional: Add visual effect (particle emitter)
                    // this.spawnHitEffect(enemy.mesh.position);
                    bullet.destroy(); // Mark bullet for removal
                }
            });
        });

        // 2. Enemy Bullets vs Player
         this.activeBullets.forEach(bullet => {
            if (bullet.isPlayerBullet || bullet._destroyed) return;
             const bulletBox = bullet.boundingBox;
             if (bulletBox.intersectsBox(playerBox)) {
                 console.log("Enemy bullet hit player");
                 this.player.takeDamage(bullet.damage);
                 bullet.destroy();
             }
         });


        // 3. Player vs Enemies
         this.activeEnemies.forEach(enemy => {
             if (enemy._destroyed) return;
             const enemyBox = enemy.boundingBox;
             if (playerBox.intersectsBox(enemyBox)) {
                 console.log("Player collided with enemy");
                 this.player.takeDamage(enemy.collisionDamage);
                 // Optional: Damage enemy? Apply brief invincibility to enemy?
                 // enemy.applyInvincibility?.(500);
             }
         });

        // 4. Player vs PowerUps
         this.activePowerUps.forEach(powerUp => {
             if (powerUp._destroyed) return;
              const powerUpBox = powerUp.boundingBox;
             if (playerBox.intersectsBox(powerUpBox)) {
                 console.log(`Player collected powerup: ${powerUp.type}`);
                 // this.player.applyPowerUp(powerUp.type); // Player should have this method
                 powerUp.destroy();
             }
         });
    }

    cleanupEntities() {
        // Generic cleanup function using filter and pooling concept
        const cleanupList = (list, poolName) => {
            return list.filter(entity => {
                if (entity._destroyed) {
                    if (entity.mesh) this.scene.remove(entity.mesh); // Remove 3D object from scene!
                    if (poolName) this.returnObjectToPool(entity, poolName);
                    return false; // Remove from active list
                }
                 // Optional: Remove if far off-screen? Might not be needed in 3D depending on level design
                return true; // Keep in active list
            });
        };

        this.activeBullets = cleanupList(this.activeBullets, 'bullets');
        this.activePowerUps = cleanupList(this.activePowerUps, 'powerUps');
        this.activeEffects = cleanupList(this.activeEffects, null); // Effects might not be pooled

        // Special handling for enemies
        const remainingEnemies = [];
        this.activeEnemies.forEach(enemy => {
            if (enemy._destroyed) {
                this.enemiesActive--;
                this.updateScore(enemy.score);
                 if (enemy.mesh) this.scene.remove(enemy.mesh);
                // Handle powerup drop
                 if (Math.random() < (enemy.dropChance ?? 0.05)) { // Use nullish coalescing for default
                     this.spawnPowerUp(enemy.mesh.position);
                 }
                this.returnObjectToPool(enemy, 'enemies');
            } else {
                remainingEnemies.push(enemy);
            }
        });
        this.activeEnemies = remainingEnemies;
    }


    updateGameState(dt) {
        if (this.gameState === PLAYING) {
            // Check for wave completion
            if (this.enemiesRemainingInWave > 0 && this.enemiesActive <= 0) {
                 // Need a robust way to know if spawning for the wave is truly finished.
                 // Assuming for now wave ends when active count is 0 after intended spawns.
                console.log(`Wave ${this.currentWave} Complete!`);
                this.gameState = WAVE_TRANSITION;
                this.waveCooldownTimer = this.waveCooldownDuration;
                this.updateGameInfoDisplay(); // Show transition message
            }
        } else if (this.gameState === WAVE_TRANSITION) {
            this.waveCooldownTimer -= dt * 1000;
            if (this.waveCooldownTimer <= 0) {
                this.startNextWave(); // Sets state back to PLAYING
            }
            // Update timer display in UI
            this.updateGameInfoDisplay();
        }
    }


    // --- Spawning / Object Pooling ---
    getObjectFromPool(poolName) {
        const pool = this.pools[poolName];
        if (pool.length > 0) {
            const obj = pool.pop();
            obj._destroyed = false;
            if (obj.mesh) this.scene.add(obj.mesh); // Add mesh back to scene!
            return obj;
        }
        // Create new instance if pool empty (requires respective classes)
        switch (poolName) {
            // case 'bullets': return new Bullet(this);
            // case 'enemies': return new Enemy(this);
            // case 'powerUps': return new PowerUp(this);
             default:
                 console.warn(`Cannot create new object for pool: ${poolName}. Class not defined?`);
                 return null; // Return null if class isn't defined/implemented yet
        }
    }

    returnObjectToPool(object, poolName) {
        if (!object) return;
        object._destroyed = true;
        if (object.mesh) this.scene.remove(object.mesh); // Remove from scene!
        // Call object's internal reset if it exists: object.reset?.();
        if (this.pools[poolName]) {
            this.pools[poolName].push(object);
        } else {
             console.warn(`Pool named ${poolName} does not exist.`);
        }
    }

    spawnEnemy() {
        // Requires Enemy.js
        const enemy = this.getObjectFromPool('enemies');
        if (enemy) {
            const type = this.getRandomEnemyTypeByWaveNumber(this.currentWave);
            const spawnPosition = this.getRandomSpawnPosition(); // Calculate a position off-screen or designated area
            enemy.reset(type, GameEngine3D.enemyTypes[type], spawnPosition); // Pass config and position
            this.activeEnemies.push(enemy);
            this.enemiesActive++;
        }
    }

    spawnBullet(originPosition, direction, damage, isPlayerBullet) {
        // Requires Bullet.js
        const bullet = this.getObjectFromPool('bullets');
        if(bullet) {
            bullet.reset(originPosition, direction, damage, isPlayerBullet);
            this.activeBullets.push(bullet);
        }
    }

     spawnPowerUp(position) {
         // Requires PowerUp.js
         const powerUp = this.getObjectFromPool('powerUps');
         if (powerUp) {
            const types = Object.keys(GameEngine3D.powerUpTypes);
            const type = types[Math.floor(Math.random() * types.length)];
            powerUp.reset(position, type);
            this.activePowerUps.push(powerUp);
        }
     }


    getRandomSpawnPosition() {
        // Simple example: spawn in a ring around the center
        const radius = 30 + Math.random() * 10; // Spawn distance
        const angle = Math.random() * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = 0.5; // Spawn slightly above ground
        return new THREE.Vector3(x, y, z);
    }

     getRandomEnemyTypeByWaveNumber(wave) { // Same logic as 2D version
        const chances = { basic: 0, tank: 0, fast: 0, shooter: 0 };
        let totalChance = 0;
        chances.basic = Math.max(0, 1 - wave * 0.08); totalChance += chances.basic;
        if (wave >= 2) { chances.fast = Math.min(0.4, wave * 0.05); totalChance += chances.fast; }
        if (wave >= 3) { chances.tank = Math.min(0.3, (wave - 2) * 0.04); totalChance += chances.tank; }
        if (wave >= 5) { chances.shooter = Math.min(0.25, (wave - 4) * 0.03); totalChance += chances.shooter; }
        const scale = 1 / totalChance;
        if(totalChance <= 0 || !isFinite(scale)) return 'basic';
        let cumulative = 0; const rand = Math.random();
        for (const type in chances) {
            cumulative += chances[type] * scale;
            if (rand < cumulative) return type;
        }
        return 'basic';
   }

    calculateEnemiesForWave(wave) { // Same logic as 2D version
        return Math.floor(5 + wave * 1.5);
    }

    // --- Game State Management ---
    startNextWave() {
        this.currentWave++;
        this.gameState = PLAYING;
        this.enemiesToSpawn = this.calculateEnemiesForWave(this.currentWave);
        this.enemiesRemainingInWave = this.enemiesToSpawn;
        this.enemiesActive = 0;
        this.updateGameInfoDisplay();

        const spawnInterval = Math.max(200, 1500 - this.currentWave * 50);
        let spawnedCount = 0;
        const spawnTimer = setInterval(() => {
            if (spawnedCount < this.enemiesToSpawn && this.gameState === PLAYING) {
                this.spawnEnemy();
                spawnedCount++;
            } else {
                clearInterval(spawnTimer);
            }
        }, spawnInterval);
    }

    updateScore(amount) {
        this.score += amount;
        this.score = Math.round(this.score);
        this.updateGameInfoDisplay(); // Update UI immediately
    }

    setFinalStats() {
        if (this.finalScoreElem) this.finalScoreElem.innerText = this.score;
        if (this.finalWaveElem) this.finalWaveElem.innerText = this.currentWave;
    }

    endGame() {
        if (this.gameState === GAME_OVER) return;
        console.log("GAME OVER");
        this.gameState = GAME_OVER;
        this.setFinalStats();
        if (document.pointerLockElement === this.canvas) { // Release pointer lock on game over
            document.exitPointerLock();
        }
        this.gameOverElem.style.display = 'block';
        this.gameInfoElem.style.display = 'none';
    }

    resetGame() {
        console.log("Resetting Game");
        this.score = 0;
        this.currentWave = 0;

        // Reset player state (if player exists)
        if (this.player) {
            this.player.health = this.player.maxHealth;
            this.player.mesh.position.set(0, this.player.config.size / 2, 0); // Reset position
            this.player.mesh.rotation.set(0, 0, 0); // Reset rotation
            this.player.isInvincible = false;
            this.player.invincibilityTimer = 0;
            // Reset any active powerups on the player object itself
        } else {
            this.createPlayer(); // Create if it doesn't exist
        }
         // Ensure camera is reset if not attached to player
         this.camera.position.set(0, 5, 10); // Reset camera position/rotation
         this.camera.rotation.set(0, 0, 0);
         this.camera.lookAt(0, 0, 0);


        // Clear active entities and return to pools
        [...this.activeBullets, ...this.activeEnemies, ...this.activePowerUps, ...this.activeEffects].forEach(entity => {
             if (entity.mesh) this.scene.remove(entity.mesh);
             // Attempt to pool known types
             if (this.pools.bullets?.includes(entity)) this.returnObjectToPool(entity, 'bullets');
             else if (this.pools.enemies?.includes(entity)) this.returnObjectToPool(entity, 'enemies');
             else if (this.pools.powerUps?.includes(entity)) this.returnObjectToPool(entity, 'powerUps');
        });

        this.activeBullets = [];
        this.activeEnemies = [];
        this.activePowerUps = [];
        this.activeEffects = [];

        this.enemiesToSpawn = 0;
        this.enemiesRemainingInWave = 0;
        this.enemiesActive = 0;
        this.waveCooldownTimer = 0;

        this.gameOverElem.style.display = 'none';
        // state will transition to WAVE_TRANSITION below
    }

    transitionToGame() {
        if (this.gameState === TITLE || this.gameState === GAME_OVER) {
            console.log("Transitioning to game...");
            this.resetGame();
            this.gameState = WAVE_TRANSITION; // Start with wave transition
            this.waveCooldownTimer = this.waveCooldownDuration; // Start countdown
             this.updateGameInfoDisplay();
            // Optional: UI fade out for title/game over screen
        }
    }

    togglePause() {
        if (this.gameState === PLAYING) {
            this.gameState = PAUSED;
            console.log("Game Paused");
             if (document.pointerLockElement === this.canvas) { // Release pointer lock on pause
                 document.exitPointerLock();
             }
            // Optional: Show pause menu overlay
        } else if (this.gameState === PAUSED) {
            this.gameState = PLAYING;
            console.log("Game Resumed");
            this.clock.getDelta(); // Consume the large delta from the pause
             // Optional: Re-request pointer lock if desired
             // this.canvas.requestPointerLock();
        }
         this.updateGameInfoDisplay(); // Update UI to show paused state or hide it
    }


    // --- UI Update ---
    updateGameInfoDisplay() {
        if (!this.gameInfoElem) return;

        switch (this.gameState) {
            case LOADING:
                this.gameInfoElem.style.display = 'block';
                // Loading message handled by LoadingManager progress
                break;
            case TITLE:
            case GAME_OVER:
                this.gameInfoElem.style.display = 'none';
                break;
            case PLAYING:
                this.gameInfoElem.style.display = 'block';
                const playerHealth = this.player ? `${this.player.health}/${this.player.maxHealth}` : 'N/A';
                this.gameInfoElem.textContent = `Score: ${this.score} | Wave: ${this.currentWave} | Health: ${playerHealth} | Enemies: ${this.enemiesActive}`;
                break;
            case PAUSED:
                 this.gameInfoElem.style.display = 'block';
                 this.gameInfoElem.textContent = `Score: ${this.score} | Wave: ${this.currentWave} | --- PAUSED ---`;
                 break;
            case WAVE_TRANSITION:
                 this.gameInfoElem.style.display = 'block';
                 const cooldownSec = (this.waveCooldownTimer / 1000).toFixed(1);
                 this.gameInfoElem.textContent = `Wave ${this.currentWave} Complete! | Next wave in ${cooldownSec}s...`;
                 break;
            default:
                this.gameInfoElem.style.display = 'none';
        }
    }

    // --- Window Resize ---
    resizeCanvas() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        console.log("Canvas resized");
    }

    // --- Start the Engine ---
    async start() {
        console.log("Starting Game Engine 3D...");
        this.setupInputListeners(); // Setup input listeners
        await this.preloadAssets(); // Wait for essential assets (or show loading screen)

        if (!this.player) {
            this.createPlayer(); // Create player object
        }
        // Initial camera setup relative to player
        this.updateCamera();

        this.gameState = TITLE; // Ensure starting state is Title after loading
        this.updateGameInfoDisplay(); // Initial UI state

        this.clock.start(); // Start Three.js clock
        this.gameLoop(0); // Start the main loop
    }
}

// Export the class if using modules
// export { GameEngine3D };

// --- How to Use (in your main.js or equivalent) ---
/*
import * as THREE from 'three'; // If using modules
import { GameEngine3D } from './GameEngine3D.js';
// Import your Player, Enemy, Bullet classes here

window.addEventListener('load', () => {
    const game = new GameEngine3D('webglCanvas', 'gameInfo', 'gameOverScreen');
    window.myGame = game; // Optional: for debugging access in console
    game.start(); // Start the engine (loads assets, then runs game loop)
});
*/
