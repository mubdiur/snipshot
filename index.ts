import { app, BrowserWindow, screen, ipcMain, desktopCapturer } from 'electron';
import screenshot from 'screenshot-desktop';
import Jimp from 'jimp';
import robot from 'robotjs';
import { writeFileSync } from 'fs';

let mainWindow: BrowserWindow | null = null;
let isRunning = true;

// Configuration
const CONFIG = {
  CAPTURE_REGION_SIZE: 200, // Size of the region around the mouse to capture
  DETECTION_INTERVAL: 100, // milliseconds between detection attempts
  MIN_RECT_SIZE: 20, // Minimum size of rectangles to detect
  SIMILARITY_THRESHOLD: 0.85, // Threshold for rectangle detection
};

// Rectangle detection using edge detection and contour analysis
async function detectRectangles(imageBuffer: Buffer): Promise<Array<{x: number, y: number, width: number, height: number}>> {
  try {
    const image = await Jimp.read(imageBuffer);
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    // Convert to grayscale
    image.greyscale();
    
    // Apply edge detection (simplified version using contrast)
    image.contrast(0.5);
    image.posterize(2);
    
    // Find rectangular regions (simplified approach)
    const rectangles = [];
    const visited = new Array(width * height).fill(false);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (visited[idx]) continue;
        
        const color = Jimp.intToRGBA(image.getPixelColor(x, y));
        if (color.r > 128) { // Edge pixel
          // Try to find rectangle boundaries
          const rect = findRectangleBoundaries(image, x, y, visited);
          if (rect && rect.width >= CONFIG.MIN_RECT_SIZE && rect.height >= CONFIG.MIN_RECT_SIZE) {
            rectangles.push(rect);
          }
        }
      }
    }
    
    return rectangles;
  } catch (error) {
    console.error('Error in rectangle detection:', error);
    return [];
  }
}

// Helper function to find rectangle boundaries
function findRectangleBoundaries(image: Jimp, startX: number, startY: number, visited: boolean[]): {x: number, y: number, width: number, height: number} | null {
  const width = image.bitmap.width;
  const height = image.bitmap.height;
  
  // Find right boundary
  let rightX = startX;
  while (rightX < width - 1) {
    const color = Jimp.intToRGBA(image.getPixelColor(rightX + 1, startY));
    if (color.r > 128) {
      rightX++;
    } else {
      break;
    }
  }
  
  // Find bottom boundary
  let bottomY = startY;
  while (bottomY < height - 1) {
    const color = Jimp.intToRGBA(image.getPixelColor(startX, bottomY + 1));
    if (color.r > 128) {
      bottomY++;
    } else {
      break;
    }
  }
  
  // Mark visited pixels
  for (let y = startY; y <= bottomY && y < height; y++) {
    for (let x = startX; x <= rightX && x < width; x++) {
      visited[y * width + x] = true;
    }
  }
  
  return {
    x: startX,
    y: startY,
    width: rightX - startX,
    height: bottomY - startY
  };
}

// Create the overlay window
function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  
  mainWindow.setIgnoreMouseEvents(true);
  mainWindow.maximize();
  
  // Load the HTML content
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 0;
          overflow: hidden;
          background: transparent;
          pointer-events: none;
        }
        
        #canvas {
          position: absolute;
          top: 0;
          left: 0;
          pointer-events: none;
        }
        
        .highlight {
          position: absolute;
          border: 2px solid #ff0000;
          background-color: rgba(255, 0, 0, 0.1);
          pointer-events: none;
          transition: all 0.1s ease;
        }
      </style>
    </head>
    <body>
      <canvas id="canvas"></canvas>
      <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        
        function resizeCanvas() {
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
        }
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        // Function to clear all highlights
        function clearHighlights() {
          const highlights = document.querySelectorAll('.highlight');
          highlights.forEach(h => h.remove());
        }
        
        // Function to draw rectangles
        function drawRectangles(rectangles) {
          clearHighlights();
          
          rectangles.forEach(rect => {
            const div = document.createElement('div');
            div.className = 'highlight';
            div.style.left = rect.x + 'px';
            div.style.top = rect.y + 'px';
            div.style.width = rect.width + 'px';
            div.style.height = rect.height + 'px';
            document.body.appendChild(div);
          });
        }
        
        // Listen for rectangle updates from main process
        require('electron').ipcRenderer.on('update-rectangles', (event, rectangles) => {
          drawRectangles(rectangles);
        });
      </script>
    </body>
    </html>
  `));
  
  // Open DevTools for debugging (optional)
  // mainWindow.webContents.openDevTools();
}

// Main detection loop
async function detectionLoop() {
  while (isRunning) {
    try {
      // Get current mouse position
      const mousePos = robot.getMousePos();
      
      // Define capture region around mouse
      const captureRegion = {
        x: Math.max(0, mousePos.x - CONFIG.CAPTURE_REGION_SIZE / 2),
        y: Math.max(0, mousePos.y - CONFIG.CAPTURE_REGION_SIZE / 2),
        width: CONFIG.CAPTURE_REGION_SIZE,
        height: CONFIG.CAPTURE_REGION_SIZE,
      };
      
      // Capture screen region
      const imageBuffer = await screenshot({
        ...captureRegion,
        format: 'png'
      });
      
      // Detect rectangles in the captured region
      const rectangles = await detectRectangles(imageBuffer);
      
      // Convert local coordinates to screen coordinates
      const screenRectangles = rectangles.map(rect => ({
        x: rect.x + captureRegion.x,
        y: rect.y + captureRegion.y,
        width: rect.width,
        height: rect.height,
      }));
      
      // Send rectangles to overlay window
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-rectangles', screenRectangles);
      }
      
      // Wait before next detection
      await new Promise(resolve => setTimeout(resolve, CONFIG.DETECTION_INTERVAL));
    } catch (error) {
      console.error('Error in detection loop:', error);
      await new Promise(resolve => setTimeout(resolve, CONFIG.DETECTION_INTERVAL));
    }
  }
}

// Keyboard listener for ESC key
function setupKeyboardListener() {
  const { globalShortcut } = require('electron');
  
  // Register ESC key to quit
  const ret = globalShortcut.register('Escape', () => {
    console.log('ESC key pressed, quitting application');
    isRunning = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
    app.quit();
  });
  
  if (!ret) {
    console.error('Failed to register ESC key shortcut');
  }
}

// Application setup
app.whenReady().then(() => {
  createOverlayWindow();
  setupKeyboardListener();
  detectionLoop();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  const { globalShortcut } = require('electron');
  globalShortcut.unregisterAll();
});