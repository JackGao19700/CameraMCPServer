# MCP Camera Service

## 功能简介

本项目是基于 Node.js/TypeScript 的多协议摄像头控制服务，严格遵循 [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol/modelcontextprotocol) TypeScript SDK，支持：
- 摄像头枚举、拍照、录像（文件/推流）等能力
- MCP 工具接口（listCameras、takePhoto、startVideo、stopVideo）
- 多种传输模式：stdio、HTTP、SSE
- 支持 Windows（dshow）和 Linux（v4l2）
- 支持多实例并发录像、推流
- 丰富的环境变量配置，日志可定制
- 录像推流支持 streamUrl，客户端可用 httpx/curl/ffmpeg/ffplay 拉流

---

## 环境依赖
- Node.js 16+
- ffmpeg（需已安装并在 PATH 或通过 ffmpeg-static 提供）
- 推荐 Windows 10+/Linux，需有摄像头设备

---

## 安装与启动

```bash
npm install
# 配置 .env 文件（见下文）
npm run build
npm start # 或 npm run start:http
```

---

## .env 配置说明
在您的本地执行时,请将.env.sample复制为.env,然后配置为您需求的参数.

```ini
# HTTP 服务端口
PORT=3001
# MCP 服务名/版本
MCP_SERVER_NAME=mcp-camera-server
MCP_SERVER_VERSION=1.0.0
# 日志等级与文件
LOG_LEVEL=info
LOG_FILEPATH=./camera.log
# 拍照/录像文件前缀与目录
PHOTO_PREFIX=image
VIDEO_PREFIX=video
PHOTO_DIR=photos
VIDEO_DIR=videos
# 录像上下文自动清理时间（秒）
FINISHED_VIDEO_CLEAN_SPAN_SECOND=1800
# 推流URL超时时间（毫秒）
STREAM_URL_EXPIRE_MS=300000
```

---

## 主要 MCP 工具接口

- **listCameras**：枚举所有可用摄像头
- **takePhoto**：拍照并保存为文件
- **startVideo**：启动录像（可保存为文件或推流）
- **stopVideo**：停止录像

> **注意：所有 curl 示例必须加 Accept: application/json, text/event-stream 头，否则会被服务端拒绝（MCP 官方协议要求）。**

### 1. listCameras
#### Windows CMD/PowerShell
```bash
curl -X POST http://localhost:3001/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"call\",\"params\":{\"tool\":\"listCameras\",\"arguments\":{}}}"
```
# 注意：body 必须为 JSON-RPC 2.0 格式
#### Linux/macOS
```bash
curl -X POST http://localhost:3001/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"call","params":{"tool":"listCameras","arguments":{}}}'
```
# 注意：body 必须为 JSON-RPC 2.0 格式
返回示例：
```json
{
  "result": {
    "success": true,
    "cameras": [
      { "cameraID": 1, "name": "1080P USB Camera", "description": "1080P USB Camera" }
    ]
  }
}
```

### 2. takePhoto
#### Windows
```bash
curl -X POST http://localhost:3001/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"call\",\"params\":{\"tool\":\"takePhoto\",\"arguments\":{\"cameraID\":1,\"filepath\":\"photos\"}}}"
```
# 注意：body 必须为 JSON-RPC 2.0 格式
#### Linux/macOS
```bash
curl -X POST http://localhost:3001/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"call","params":{"tool":"takePhoto","arguments":{"cameraID":1,"filepath":"photos"}}}'
```
# 注意：body 必须为 JSON-RPC 2.0 格式
返回：图片文件路径

### 3. startVideo（文件保存模式）
#### Windows
```bash
curl -X POST http://localhost:3001/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"call\",\"params\":{\"tool\":\"startVideo\",\"arguments\":{\"cameraID\":1,\"filepath\":\"videos\",\"duration\":100}}}"
```
# 注意：body 必须为 JSON-RPC 2.0 格式
#### Linux/macOS
```bash
curl -X POST http://localhost:3001/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"call","params":{"tool":"startVideo","arguments":{"cameraID":1,"filepath":"videos","duration":100}}}'
```
# 注意：body 必须为 JSON-RPC 2.0 格式
返回：视频文件路径、videoID

### 4. stopVideo
#### Windows
```bash
curl -X POST http://localhost:3001/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"call\",\"params\":{\"tool\":\"stopVideo\",\"arguments\":{\"videoID\":\"xxxx-xxxx-xxxx\"}}}"
```
# 注意：body 必须为 JSON-RPC 2.0 格式
#### Linux/macOS
```bash
curl -X POST http://localhost:3001/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"call","params":{"tool":"stopVideo","arguments":{"videoID":"xxxx-xxxx-xxxx"}}}'
```
# 注意：body 必须为 JSON-RPC 2.0 格式

### 5. startVideo（推流模式，streamUrl）
#### Windows
```bash
curl -X POST http://localhost:3001/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"call\",\"params\":{\"tool\":\"startVideo\",\"arguments\":{\"cameraID\":1}}}"
```
# 注意：body 必须为 JSON-RPC 2.0 格式
#### Linux/macOS
```bash
curl -X POST http://localhost:3001/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"call","params":{"tool":"startVideo","arguments":{"cameraID":1}}}'
```
# 注意：body 必须为 JSON-RPC 2.0 格式
返回：
```json
{
  "result": {
    "success": true,
    "videoID": "xxxx-xxxx-xxxx",
    "streamUrl": "/video/stream?videoID=xxxx-xxxx-xxxx"
  }
}
```

---

## 视频流测试方法

### 1. 用 curl 保存为 ts 文件
```bash
curl http://localhost:3001/video/stream?videoID=xxxx-xxxx-xxxx -o output.ts
```

### 2. 用 ffplay 直接播放
```bash
ffplay http://localhost:3001/video/stream?videoID=xxxx-xxxx-xxxx
```

### 3. 用 ffmpeg 保存为 mp4 文件

#### 直接转码为 mp4（推荐）
```bash
ffmpeg -i "http://localhost:3001/video/stream?videoID=xxxx-xxxx-xxxx" -c:v libx264 -preset veryfast -crf 23 -f mp4 output.mp4
```

#### 只保存为 ts 文件（无需转码，最快）
```bash
ffmpeg -i "http://localhost:3001/video/stream?videoID=xxxx-xxxx-xxxx" -c copy output.ts
```

---

## 常见问题与排查

- **ffplay/ffmpeg 报 Invalid data found when processing input**
  - 请确认服务端推流格式为 mpegts（已修正）
- **streamUrl 只能消费一次/超时失效**
  - 设计如此，需重新调用 startVideo 获取新 streamUrl
- **摄像头找不到/拍照失败**
  - 请先用 listCameras 获取 cameraID，确保 ffmpeg 能识别
- **录像文件无法播放**
  - 建议用 ffmpeg/ffplay 转码或播放
- **推流超时时间/录像上下文清理时间**
  - 可通过 .env 配置 STREAM_URL_EXPIRE_MS、FINISHED_VIDEO_CLEAN_SPAN_SECOND

---

## 其它说明
- 支持多实例并发录像/推流
- 日志详尽，便于排查
- 支持 Windows/Linux，自动适配 dshow/v4l2
- 支持 MCP stdio/http/sse 多种模式

如有更多问题或需求，欢迎 issue 或联系Jackgao19700@qq.com。
