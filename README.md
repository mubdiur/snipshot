# Snipshot - Screen Rectangle Detection Overlay

A Node.js (Bun) application that creates a transparent overlay for the entire
screen and highlights rectangular regions detected using computer vision
algorithms where the mouse is hovering.

## Features

- Real-time screen capture around mouse cursor
- Computer vision-based rectangle detection
- Transparent overlay window with highlighted rectangles
- ESC key to exit the application
- Configurable detection parameters

## Installation

1. Install dependencies:

```bash
bun install
```

## Usage

Run the application:

```bash
npm start
```

Or using bun directly:

```bash
bun run index.ts
```

## How It Works

1. **Screen Capture**: The application captures a 200x200 pixel region around
   the mouse cursor every 100ms
2. **Rectangle Detection**: Uses edge detection and contour analysis to identify
   rectangular shapes
3. **Overlay Display**: Creates a transparent window that highlights detected
   rectangles with red borders
4. **Mouse Tracking**: Continuously follows the mouse cursor to analyze the area
   around it
5. **Exit**: Press ESC key to quit the application

## Configuration

You can modify the detection parameters in the `CONFIG` object in `index.ts`:

- `CAPTURE_REGION_SIZE`: Size of the region around the mouse to capture
  (default: 200px)
- `DETECTION_INTERVAL`: Milliseconds between detection attempts (default: 100ms)
- `MIN_RECT_SIZE`: Minimum size of rectangles to detect (default: 20px)
- `SIMILARITY_THRESHOLD`: Threshold for rectangle detection (default: 0.85)

## Dependencies

- **Electron**: For creating the transparent overlay window
- **screenshot-desktop**: For capturing screen regions
- **Jimp**: For image processing and computer vision
- **robotjs**: For mouse position tracking
- **sharp**: For image manipulation

## Technical Details

### Rectangle Detection Algorithm

The application uses a simplified computer vision approach:

1. Converts captured images to grayscale
2. Applies contrast enhancement and posterization
3. Performs edge detection
4. Finds rectangular boundaries by tracing edges
5. Filters rectangles based on minimum size requirements

### Overlay Window

The overlay window is:

- Transparent and borderless
- Always on top of other windows
- Covers the entire screen
- Ignores mouse events to allow interaction with underlying applications
- Updates in real-time with detected rectangles

## Troubleshooting

If the application doesn't start:

1. Ensure all dependencies are installed: `bun install`
2. Check that Electron is properly installed
3. On Windows, you may need to allow the application through firewall
4. Make sure you have sufficient permissions for screen capture

## Development

To run in development mode:

```bash
npm run dev
```

To build the application:

```bash
npm run build
```
