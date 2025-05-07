# MCP Camera Service

## Overview

This Node.js/TypeScript based multi-protocol camera control service strictly follows the [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol/modelcontextprotocol) TypeScript SDK and supports:
- Camera enumeration, photo capture, video recording (file/streaming)
- MCP tool interfaces (listCameras, takePhoto, startVideo, stopVideo)
- Multiple transport modes: stdio, HTTP, SSE
- Windows (dshow) and Linux (v4l2) support
- Concurrent video recording/streaming with multiple instances
- Customizable environment variables and logging
- Video streaming with streamUrl support for clients (httpx/curl/ffmpeg/ffplay)

---

## Requirements
- Node.js 16+
- ffmpeg (installed in PATH or provided via ffmpeg-static)
- Recommended: Windows 10+/Linux with camera devices

---

## Installation & Startup

```bash
npm install
# Configure .env file (see below)
npm run build
npm start # or npm run start:http
```

## Configuration
The service can be configured using environment variables. Copy .env.sample to .env and configure as needed. Here are the available variables:
```env
# HTTP service port
PORT=3001
# MCP service name/version
MCP_SERVER_NAME=mcp-camera-server
MCP_SERVER_VERSION=1.0.0
# Log level and file
LOG_LEVEL=info
LOG_FILEPATH=./camera.log
# Photo/video file prefix and directory
PHOTO_PREFIX=image
VIDEO_PREFIX=video
PHOTO_DIR=photos
VIDEO_DIR=videos
# Video context auto-cleanup time (seconds)
FINISHED_VIDEO_CLEAN_SPAN_SECOND=1800
# Stream URL expiration time (milliseconds)
STREAM_URL_EXPIRE_MS=300000
```
---
## Main MCP Tool Interfaces
### 1. listCameras - Enumerate Cameras
Function: List all available camera devices

Input Parameters: None

Output Parameters:

- cameras: Camera list
  - cameraID: Camera ID
  - name: Device name
  - description: Device description
### 2. takePhoto - Capture Photo
Function: Take photo from specified camera and save

Input Parameters:

- cameraID: Camera ID
- filepath: Photo save directory path
Output Parameters:

- success: Operation status
- imagePath: Photo save path (on success)
- error: Error message (on failure)
### 3. startVideo - Start Recording/Streaming
Function: Start video recording or live streaming

Input Parameters:

- cameraID: Camera ID
- filepath: Video save path (optional, omit for streaming mode)
- duration: Recording duration in ms (optional)
Output Parameters (File Mode):

- success: Operation status
- videoPath: Video file path
- videoID: Recording session ID
Output Parameters (Streaming Mode):

- success: Operation status
- videoID: Recording session ID
- streamUrl: Streaming access URL
### 4. stopVideo - Stop Recording/Streaming
Function: Stop ongoing recording or streaming

Input Parameters:

- videoID: Recording session ID (from startVideo)
Output Parameters:

- success: Operation status
- message: Result message
- videoPath: Video file path (in file mode)
- error: Error message (on failure)
## MCP Tool Testing Method
- After cloning the repo, enter root directory: cd myCameraNodejs
- Link as global command: npm link .
- Start modelcontextprotocol/inspector for testing: npx modelcontextprotocol/inspector
In the interface:
![img](./doc/inspector.png)

- Transport Type : Select STDIO
- Command : Select npx
- Arguments : Enter mcp-camera-server
Click Connect to connect to camera service.
If starting with npm run start:sse , fill URL with http://127.0.0.1:3001/sse (3001 is from PORT in .env)

## Video Streaming Testing
### 1. Save as ts file using curl
```bash
curl http://localhost:3001/video/stream?videoID=xxxx-xxxx-xxxx -o output.ts
```

### 2. Play directly using ffplay
```bash
ffplay http://localhost:3001/video/stream?videoID=xxxx-xxxx-xxxx
```

### 3. Save as mp4 using ffmpeg

#### Direct transcoding to mp4 (recommended)
```bash
ffmpeg -i "http://localhost:3001/video/stream?videoID=xxxx-xxxx-xxxx" -c:v libx264 -preset veryfast -crf 23 -f mp4 output.mp4
```

#### Save as ts file (fastest, no transcoding)
```bash
ffmpeg -i "http://localhost:3001/video/stream?videoID=xxxx-xxxx-xxxx" -c copy output.ts
```

---

## Troubleshooting
- ffplay/ffmpeg reports "Invalid data found when processing input"
  - Confirm server streaming format is mpegts (fixed)
- streamUrl can only be consumed once/expires
  - By design, call startVideo again for new streamUrl
- Camera not found/photo capture failed
  - First get cameraID via listCameras, ensure ffmpeg can recognize it
- Recorded video cannot be played
  - Try transcoding/playing with ffmpeg/ffplay
- Stream expiration time/video context cleanup time
  - Configure via .env: STREAM_URL_EXPIRE_MS, FINISHED_VIDEO_CLEAN_SPAN_SECOND
## Additional Notes
- Supports concurrent recording/streaming with multiple instances
- Detailed logging for troubleshooting
- Supports Windows/Linux, auto-adapts dshow/v4l2
- Supports MCP stdio/http/sse multiple modes
For questions or requests, please open an issue or contact Jackgao19700@qq.com .