import { GameEngine3D } from 'GameEngine3D.js';

window.addEventListener('load', () => {
    const canvasId = 'webglCanvas';
    const uiContainerId = 'uiContainer'; // Pass container for UIManager

    const game = new GameEngine3D(canvasId, uiContainerId);
    window.myGame = game; // Optional: For debugging access in console

    // Check for WebGL support before starting
    if (game.renderer.isWebGLAvailable()) {
        game.start().catch(error => {
            console.error("Failed to start the game:", error);
            // Display error message to the user in the UI
            const loadingScreen = document.getElementById('loadingScreen');
            const loadingProgress = document.getElementById('loadingProgress');
            if (loadingScreen) loadingScreen.style.display = 'block';
            if (loadingProgress) loadingProgress.textContent = "Error initializing game. Please check console.";
        });
    } else {
        const warning = game.renderer.getWebGLErrorMessage();
        document.getElementById('uiContainer').appendChild(warning); // Show WebGL error
        console.error("WebGL is not available.");
         const loadingScreen = document.getElementById('loadingScreen');
         if (loadingScreen) loadingScreen.style.display = 'none'; // Hide loading msg
    }
});
