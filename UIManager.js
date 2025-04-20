export class UIManager {
    constructor(containerId, engine) {
        this.container = document.getElementById(containerId);
        this.engine = engine; // Reference to engine for game state and localization

        if (!this.container) {
            console.error(`UI Container with ID "${containerId}" not found! UI will not function.`);
            return;
        }

        // --- Element References ---
        this.gameInfoElem = this.container.querySelector('#gameInfo');
        this.crosshairElem = this.container.querySelector('#crosshair');
        this.gameOverScreen = this.container.querySelector('#gameOverScreen');
        this.finalScoreValueElem = this.container.querySelector('#finalScoreValue');
        this.finalWaveValueElem = this.container.querySelector('#finalWaveValue');
        this.restartButton = this.container.querySelector('#restartButton');
        this.pauseScreen = this.container.querySelector('#pauseScreen');
        this.resumeButton = this.container.querySelector('#resumeButton');
        this.loadingScreen = this.container.querySelector('#loadingScreen');
        this.loadingProgressElem = this.container.querySelector('#loadingProgress');

        this.bindEvents();
        this.translateUI(); // Initial translation
        document.addEventListener('localizationUpdated', () => this.translateUI()); // Update on language change
        console.log("UIManager Initialized");
    }

    bindEvents() {
        if (this.restartButton) {
            this.restartButton.addEventListener('click', () => this.engine.transitionToGame());
        }
        if (this.resumeButton) {
            this.resumeButton.addEventListener('click', () => this.engine.togglePause());
        }
        // Add listeners for settings buttons, etc. if they exist
    }

    update(dt) {
        // Update dynamic UI elements based on game state from the engine
        const state = this.engine.gameState;
        const player = this.engine.player;
        const localization = this.engine.localizationService; // Assuming engine has localization service instance

        // Loading Screen
        if (this.loadingScreen) {
            this.loadingScreen.style.display = state === this.engine.state.LOADING ? 'flex' : 'none';
        }

        // Game Over Screen
        if (this.gameOverScreen) {
            this.gameOverScreen.style.display = state === this.engine.state.GAME_OVER ? 'flex' : 'none';
            if (state === this.engine.state.GAME_OVER) {
                if (this.finalScoreValueElem) this.finalScoreValueElem.textContent = this.engine.score;
                if (this.finalWaveValueElem) this.finalWaveValueElem.textContent = this.engine.currentWave;
            }
        }

        // Pause Screen
        if (this.pauseScreen) {
            this.pauseScreen.style.display = state === this.engine.state.PAUSED ? 'flex' : 'none';
        }

        // Crosshair visibility
        if (this.crosshairElem) {
            const showCrosshair = state === this.engine.state.PLAYING && this.engine.inputState?.mouse.isPointerLocked;
            this.crosshairElem.style.display = showCrosshair ? 'block' : 'none';
        }

        // Game Info HUD
        if (this.gameInfoElem) {
            if (state === this.engine.state.PLAYING || state === this.engine.state.WAVE_TRANSITION) {
                this.gameInfoElem.style.display = 'block';
                let infoText = '';
                const scoreLabel = localization.getText('score');
                const waveLabel = localization.getText('wave');
                const healthLabel = localization.getText('health');
                const enemiesLabel = localization.getText('enemies');

                if (state === this.engine.state.PLAYING) {
                    const playerHealth = player ? `${player.health}/${player.maxHealth}` : 'N/A';
                    infoText = `${scoreLabel}: ${this.engine.score} | ${waveLabel}: ${this.engine.currentWave} | ${healthLabel}: ${playerHealth} | ${enemiesLabel}: ${this.engine.enemiesActive}`;
                } else { // WAVE_TRANSITION
                    const cooldownSec = (this.engine.waveCooldownTimer / 1000).toFixed(1);
                    infoText = localization.getText('nextWaveIn', { values: { seconds: cooldownSec } });
                }
                this.gameInfoElem.textContent = infoText;

            } else {
                this.gameInfoElem.style.display = 'none';
            }
        }
    }

    updateLoadingProgress(percentage) {
         if (this.loadingProgressElem) {
             this.loadingProgressElem.textContent = `${percentage.toFixed(0)}%`;
         }
     }

    showLoadingError(message) {
         if (this.loadingScreen) this.loadingScreen.style.display = 'flex';
         if (this.loadingProgressElem) this.loadingProgressElem.textContent = `Error: ${message}`;
     }

    translateUI() {
         console.log("Updating UI translations...");
         if (!this.engine.localizationService) return;
         this.container.querySelectorAll('[data-i18n]').forEach(element => {
             const key = element.getAttribute('data-i18n');
             // Check for interpolation/pluralization options if needed
             // const options = this.#getOptionsFromElement(element);
             element.textContent = this.engine.localizationService.getText(key);
         });
         // Translate elements not using data-i18n if necessary
         this.update(); // Refresh dynamic text potentially affected by language change
     }
}
