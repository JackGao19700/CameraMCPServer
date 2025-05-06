import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import winston from 'winston';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerCameraTools } from './mcp/tools.js';
import { CameraManager } from './camera/cameraManager.js';

// 环境变量
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const MCP_SERVER_NAME = process.env.MCP_SERVER_NAME || 'mcp-camera-server';
const MCP_SERVER_VERSION = process.env.MCP_SERVER_VERSION || '1.0.0';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FILEPATH = process.env.LOG_FILEPATH;

// 日志
const loggerTransports: winston.transport[] = [new winston.transports.Console()];
if (LOG_FILEPATH) {
  loggerTransports.push(new winston.transports.File({ filename: LOG_FILEPATH }));
}
const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: loggerTransports
});

// MCP Server
const server = new McpServer({
  name: MCP_SERVER_NAME,
  version: MCP_SERVER_VERSION
});
registerCameraTools(server);

function startStdioServer(server: McpServer) {
  logger.info('以 stdio 模式启动');
  const transport = new StdioServerTransport();
  server.connect(transport);
}

function startHttpExpressServer(server: McpServer) {
  logger.info('以 http/express 模式启动');

  const app = express();
  app.use(express.json());

  // 存储SSE和Streamable HTTP的transport
  const transportsMap = {
    streamable: {} as Record<string, StreamableHTTPServerTransport>,
    sse: {} as Record<string, SSEServerTransport>
  };

  // 视频推流专用 endpoint
  app.get('/video/stream', async (req, res) => {
    const videoID = req.query.videoID as string;
    if (!videoID) {
      res.status(400).send('videoID is required');
      return;
    }
    const params = CameraManager.getStreamParams(videoID);
    if (!params) {
      res.status(404).send('Stream not found or expired');
      return;
    }
    // 启动 ffmpeg 进程
    const proc = CameraManager.createStreamProcess(videoID);
    if (!proc || !proc.stdout) {
      res.status(500).send('Failed to start stream');
      return;
    }
    // 只允许消费一次
    // 清理参数，防止重复消费
    // （可选：可加超时自动清理）
    const streamExpireMs = process.env.STREAM_URL_EXPIRE_MS ? parseInt(process.env.STREAM_URL_EXPIRE_MS, 10) : 5 * 60 * 1000;
    setTimeout(() => CameraManager.clearStreamParams(videoID), streamExpireMs);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Transfer-Encoding', 'chunked');
    proc.stdout.pipe(res);
    proc.stdout.on('end', () => res.end());
    proc.stdout.on('error', (err) => res.status(500).end('Stream error: ' + err.message));
    proc.on('exit', () => {
      CameraManager.clearStreamParams(videoID);
    });
  });

  // Streamable HTTP endpoint（推荐新客户端用）
  app.all('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
    transportsMap.streamable[String(req.ip)] = transport;
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // SSE endpoint（兼容老客户端）
  app.get('/sse', async (req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    transportsMap.sse[transport.sessionId] = transport;
    res.on('close', () => {
      delete transportsMap.sse[transport.sessionId];
    });
    await server.connect(transport);
  });

  // SSE消息POST endpoint
  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transportsMap.sse[sessionId];
    if (transport) {
      await transport.handlePostMessage(req, res, req.body);
    } else {
      res.status(400).send('No transport found for sessionId');
    }
  });

  app.listen(PORT, () => {
    logger.info(`MCP Camera Server starts on http://127.0.0.1:${PORT}/sse`);
  });
}

// 启动模式分发
const mode = (process.argv[2] as 'stdio' | 'http' | 'sse') || 'http';

// 先初始化摄像头映射表，再启动服务
CameraManager.initialize().then(() => {
  if (mode === 'stdio') {
    startStdioServer(server);
  } else {
    startHttpExpressServer(server);
  }
});
