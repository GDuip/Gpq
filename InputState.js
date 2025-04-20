import *even Three from 'three';

// Encapsulates raw and processed input state
export class InputState {
    constructor(canvas) {
        this.canvas = canvas;

        // Raw state
        this.keys = {};
        this.mouse = {
            x: 0, y: 0, // Normalized position (-1 to 1)
            buttons: { left: false, right: false, middle: false },
            deltaX: 0, deltaY: 0, // Accumulated delta for pointer lock
            isPointerLocked: false
        };

        // Processed/Abstracted Actions
        this.actions = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            shoot: false, // Continuous state (holding button)
            shootPressed: false, // Triggered on press
            switchWeaponPrev: false, // Triggered
            switchWeaponNext: false, // Triggered
            pause: false, // Triggered
            interact: false // Triggered
        };

        // Aiming state
        this.aimDelta = new THREE.Vector2(); // For mouse look delta since last frame

        this.setupListeners();
    }

    setupListeners() {
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));

        document.addEventListener('pointerlockchange', () => this.handlePointerLockChange(), false);
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e), false);
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent right-click menu

        // Prevent browser scrolling/actions for game keys
         window.addEventListener("keydown", (e) => {
            if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
                e.preventDefault();
            }
        }, false);
    }

    handleKeyDown(e) {
        if(e.repeat) return; // Ignore repeated events from holding key down
        this.keys[e.code] = true;
        // Set triggered actions ONCE on key down
        if (e.code === 'KeyP') this.actions.pause = true;
        if (e.code === 'KeyE') this.actions.interact = true;
        if (e.code === 'Digit1') this.actions.switchWeaponPrev = true; // Example binding
        if (e.code === 'Digit2') this.actions.switchWeaponNext = true; // Example binding
         if (e.code === 'Space' && !this.actions.shoot) this.actions.shootPressed = true; // Trigger only if not already holding shoot
    }

    handleKeyUp(e) {
        this.keys[e.code] = false;
    }

    handlePointerLockChange() {
        this.mouse.isPointerLocked = document.pointerLockElement === this.canvas;
        console.log("Pointer Lock:", this.mouse.isPointerLocked);
        if (!this.mouse.isPointerLocked) {
            // Reset movement/actions when losing lock might be desired
            // Object.keys(this.actions).forEach(key => this.actions[key] = false);
            this.mouse.deltaX = 0;
            this.mouse.deltaY = 0;
            this.aimDelta.set(0,0);
        }
    }

    handleMouseMove(e) {
        if (this.mouse.isPointerLocked) {
            this.mouse.deltaX += e.movementX || 0;
            this.mouse.deltaY += e.movementY || 0;
        } else {
            // Update normalized position if needed for UI outside pointer lock
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        }
    }

    handleMouseDown(e) {
        if (this.mouse.isPointerLocked) {
            if (e.button === 0) { // Left click
                this.mouse.buttons.left = true;
                if(!this.actions.shoot) this.actions.shootPressed = true; // Trigger press
            }
            if (e.button === 1) this.mouse.buttons.middle = true;
            if (e.button === 2) this.mouse.buttons.right = true; // Right click
        } else {
            // Request pointer lock on click if not already locked (and game is playing)
            // This logic might live better in the UIManager or GameEngine state handling
            // this.canvas.requestPointerLock();
        }
    }

    handleMouseUp(e) {
        // Note: Buttons might still be reported as pressed if lock is lost before mouseup
        if (e.button === 0) this.mouse.buttons.left = false;
        if (e.button === 1) this.mouse.buttons.middle = false;
        if (e.button === 2) this.mouse.buttons.right = false;
    }

    // Call this at the START of each game loop frame
    update() {
        // --- Update Continuous Actions ---
        this.actions.forward = !!(this.keys['KeyW'] || this.keys['ArrowUp']);
        this.actions.backward = !!(this.keys['KeyS'] || this.keys['ArrowDown']);
        this.actions.left = !!(this.keys['KeyA'] || this.keys['ArrowLeft']);
        this.actions.right = !!(this.keys['KeyD'] || this.keys['ArrowRight']);
        this.actions.jump = !!this.keys['Space']; // Assuming space is jump

        // Shoot action reflects holding the button
        this.actions.shoot = this.mouse.buttons.left || !!this.keys['ControlLeft'] || !!this.keys['ControlRight']; // Example alternative shoot key

        // --- Process Accumulated Mouse Delta ---
        this.aimDelta.set(this.mouse.deltaX, this.mouse.deltaY);
        // Reset accumulated raw delta for the next frame
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;

        // --- Important: Reset Triggered Actions ---
        // Triggered actions should only be true for the single frame they occur
        // Do this at the END of the update or after systems have checked them
    }

    // Call this at the END of each game loop frame
    resetTriggers() {
        this.actions.shootPressed = false;
        this.actions.pause = false;
        this.actions.interact = false;
        this.actions.switchWeaponPrev = false;
        this.actions.switchWeaponNext = false;
         // Don't reset jump here if it should be continuous while holding space
    }

    requestPointerLock() {
         if (!this.mouse.isPointerLocked) {
             this.canvas.requestPointerLock().catch(err => {
                 console.warn("Pointer lock request failed:", err);
             });
         }
     }

     exitPointerLock() {
          if (this.mouse.isPointerLocked) {
              document.exitPointerLock();
          }
      }
}
