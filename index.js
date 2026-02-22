import { app, BrowserWindow, screen, ipcMain, desktopCapturer, globalShortcut } from "electron";
import screenshot from "screenshot-desktop";
import Jimp from "jimp";
import robot from "robotjs";

let mainWindow = null;
let isRunning = true;

// Configuration
const CONFIG = {
  CAPTURE_REGION_SIZE: 200,
  DETECTION_INTERVAL: 100,
  MIN_RECT_SIZE: 20,
  SIMILARITY_THRESHOLD: 0.85,
};

// Rectangle detection
async function detectRectangles(imageBuffer) {
  try {
    const image = await Jimp.read(imageBuffer);
    const width = image.bitmap.width;
    const height = image.bitmap.height;

    image.greyscale().contrast(0.5).posterize(2);

    const rectangles = [];
    const visited = new Array(width * height).fill(false);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (visited[idx]) continue;

        const { r } = Jimp.intToRGBA(image.getPixelColor(x, y));
        if (r > 128) {
          const rect = findRectangleBoundaries(image, x, y, visited);
          if (rect && rect.width >= CONFIG.MIN_RECT_SIZE && rect.height >= CONFIG.MIN_RECT_SIZE) {
            rectangles.push(rect);
          }
        }
      }
    }
    return rectangles;
  } catch (err) {
    console.error("Error detecting rectangles:", err);
    return [];
  }
}

function findRectangleBoundaries(image, startX, startY, visited) {
  const width = image.bitmap.width;
  const height = image.bitmap.height;

  let rightX = startX;
  while (rightX < width - 1) {
    const { r } = Jimp.intToRGBA(image.getPixelColor(rightX + 1, startY));
    if (r > 128) rightX++;
    else break;
  }

  let bottomY = startY;
  while (bottomY < height - 1) {
    const { r } = Jimp.intToRGBA(image.getPixelColor(startX, bottomY + 1));
    if (r > 128) bottomY++;
    else break;
  }

  for (let y = startY; y <= bottomY && y < height; y++) {
    for (let x = startX; x <= rightX && x < width; x++) {
      visited[y * width + x] = true;
    }
  }

  return {
    x: startX,
    y: startY,
    width: rightX - startX,
    height: bottomY - startY,
  };
}

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
      preload: new URL("./preload.js", import.meta.url).pathname,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setIgnoreMouseEvents(true);
  mainWindow.maximize();

  const html = `
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
          .highlight {
            position: absolute;
            border: 2px solid red;
            background-color: rgba(255, 0, 0, 0.15);
            pointer-events: none;
            transition: 0.1s ease;
          }
        </style>
      </head>
      <body>
        <script>
          window.electronAPI.onRectangles((rectangles) => {
            document.querySelectorAll('.highlight').forEach(x => x.remove());

            rectangles.forEach(rect => {
              const div = document.createElement('div');
              div.className = 'highlight';
              div.style.left = rect.x + 'px';
              div.style.top = rect.y + 'px';
              div.style.width = rect.width + 'px';
              div.style.height = rect.height + 'px';
              document.body.appendChild(div);
            });
          });
        </script>
      </body>
    </html>
  `;

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

// Main detection loop
async function detectionLoop() {
  while (isRunning) {
    try {
      const mousePos = robot.getMousePos();

      const captureRegion = {
        x: Math.max(0, mousePos.x - CONFIG.CAPTURE_REGION_SIZE / 2),
        y: Math.max(0, mousePos.y - CONFIG.CAPTURE_REGION_SIZE / 2),
        width: CONFIG.CAPTURE_REGION_SIZE,
        height: CONFIG.CAPTURE_REGION_SIZE,
      };

      const imageBuffer = await screenshot({ ...captureRegion, format: "png" });

      const rectangles = await detectRectangles(imageBuffer);

      const screenRectangles = rectangles.map(r => ({
        x: r.x + captureRegion.x,
        y: r.y + captureRegion.y,
        width: r.width,
        height: r.height,
      }));

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("update-rectangles", screenRectangles);
      }

      await new Promise(res => setTimeout(res, CONFIG.DETECTION_INTERVAL));
    } catch (err) {
      console.error("Detection loop error:", err);
      await new Promise(res => setTimeout(res, CONFIG.DETECTION_INTERVAL));
    }
  }
}

function setupKeyboardListener() {
  globalShortcut.register("Escape", () => {
    isRunning = false;
    mainWindow?.close();
    app.quit();
  });
}

app.whenReady().then(() => {
  createOverlayWindow();
  setupKeyboardListener();
  detectionLoop();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
