import { CameraInfo, TakePhotoResult, VideoResult } from './types.js';
import path from 'path';
import os from 'os';
import fs from 'fs';
// @ts-ignore
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { spawn, ChildProcessWithoutNullStreams, ChildProcessByStdio } from 'child_process';
import winston from 'winston';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';

// 视频流参数配置
const VIDEO_BITRATE = process.env.VIDEO_BITRATE || '800k';
const VIDEO_FPS = process.env.VIDEO_FPS ? parseInt(process.env.VIDEO_FPS, 10) : 25;
const VIDEO_RESOLUTION = process.env.VIDEO_RESOLUTION || '640x480';

// 日志
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [new winston.transports.Console()]
});

const FINISHED_VIDEO_CLEAN_SPAN_SECOND = process.env.FINISHED_VIDEO_CLEAN_SPAN_SECOND ? parseInt(process.env.FINISHED_VIDEO_CLEAN_SPAN_SECOND, 10) : 1800; // 秒

interface VideoContext {
  videoID: string;
  cameraID: string;
  absPath?: string;
  proc: ChildProcessWithoutNullStreams | ChildProcessByStdio<null, Readable, Readable>;
  stopped: boolean;
  exitPromise: Promise<void>;
  cleanTimer?: NodeJS.Timeout;
}

const videoContexts = new Map<string, VideoContext>();

// 全局摄像头映射表
let cameraNameMap: string[] = [];

// 推流参数缓存
const streamParamsMap = new Map<string, { cameraID: number | string, duration?: number, isConsumed: boolean }>();

const STREAM_URL_EXPIRE_MS = process.env.STREAM_URL_EXPIRE_MS ? parseInt(process.env.STREAM_URL_EXPIRE_MS, 10) : 5 * 60 * 1000; // ms, 默认5分钟
const streamTimeouts = new Map<string, NodeJS.Timeout>();

function scanCameras() {
  const platform = os.platform();
  let cmd: string, args: string[];
  if (platform === 'win32') {
    cmd = typeof ffmpegPath === 'string' ? ffmpegPath : 'ffmpeg';
    args = ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'];
  } else {
    cmd = typeof ffmpegPath === 'string' ? ffmpegPath : 'ffmpeg';
    args = ['-f', 'v4l2', '-list_formats', 'all', '-i', '/dev/video0'];
  }
  return new Promise<string[]>((resolve) => {
    const proc = spawn(cmd, args);
    let output = '';
    proc.stderr.on('data', (data) => { output += data.toString(); });
    proc.on('close', () => {
      const names: string[] = [];
      if (platform === 'win32') {
        const regex = /"([^"]+)" \(video\)/g;
        let match;
        while ((match = regex.exec(output)) !== null) {
          names.push(match[1]);
        }
      } else {
        const devRegex = /\[video4linux2,v4l2\] (\/dev\/video\d+)/g;
        let match;
        while ((match = devRegex.exec(output)) !== null) {
          names.push(match[1].replace('/dev/', ''));
        }
        if (names.length === 0) {
          const devs = fs.readdirSync('/dev').filter(f => f.startsWith('video'));
          for (const dev of devs) {
            names.push(dev);
          }
        }
      }
      resolve(names);
    });
  });
}

function sanitizeCameraID(cameraID: string) {
  return cameraID.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getTimestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '');
}

function scheduleVideoContextCleanup(videoID: string) {
  const ctx = videoContexts.get(videoID);
  if (!ctx) return;
  if (ctx.cleanTimer) clearTimeout(ctx.cleanTimer);
  ctx.cleanTimer = setTimeout(() => {
    videoContexts.delete(videoID);
    logger.info(`自动清理录像上下文: videoID=${videoID}`);
  }, FINISHED_VIDEO_CLEAN_SPAN_SECOND * 1000);
}

export class CameraManager {
  static async initialize() {
    cameraNameMap = await scanCameras();
  }

  static listCameras(): CameraInfo[] {
    // 只遍历 cameraNameMap 返回
    return cameraNameMap.map((name, idx) => ({
      cameraID: idx + 1,
      name,
      description: name
    }));
  }

  static getCameraNameByID(cameraID: number | string): string | undefined {
    const idx = typeof cameraID === 'string' ? parseInt(cameraID, 10) : cameraID;
    if (!idx || idx < 1 || idx > cameraNameMap.length) return undefined;
    return cameraNameMap[idx - 1];
  }

  static async takePhoto(cameraID: number | string, absPath: string): Promise<TakePhotoResult> {
    try {
      const platform = os.platform();
      const realName = this.getCameraNameByID(cameraID);
      if (!realName) return { success: false, error: '无效cameraID' };
      let input;
      let args;
      if (platform === 'win32') {
        input = `video=${realName.trim()}`;
        args = ['-f', 'dshow', '-i', input, '-frames:v', '1', '-update', '1', '-pix_fmt', 'yuvj422p', '-loglevel', 'error', '-y', absPath];
      } else {
        input = `/dev/${realName}`;
        args = ['-f', 'v4l2', '-i', input, '-frames:v', '1', '-update', '1', '-pix_fmt', 'yuvj422p', '-loglevel', 'error', '-y', absPath];
      }
      const ffmpegBin = typeof ffmpegPath === 'string' ? ffmpegPath : 'ffmpeg';
      return await new Promise((resolve) => {
        logger.info(`${ffmpegBin} args is:<${args}>`);
        const proc = spawn(ffmpegBin, args);
        proc.stderr.on('data', (data) => logger.error(`[ffmpeg] ${data}`));
        proc.on('exit', (code) => {
          if (code === 0 && fs.existsSync(absPath)) {
            logger.info(`拍照成功: ${absPath}`);
            resolve({ success: true, imagePath: absPath });
          } else {
            logger.error(`拍照失败: ffmpeg exit code ${code}`);
            resolve({ success: false, error: `ffmpeg exit code ${code}` });
          }
        });
      });
    } catch (e) {
      logger.error(`拍照异常: ${e}`);
      return { success: false, error: String(e) };
    }
  }

  static clearStreamParams(videoID: string) {
    const params = streamParamsMap.get(videoID);
    if (params) {
      streamParamsMap.delete(videoID);
      const t = streamTimeouts.get(videoID);
      if (t) clearTimeout(t);
      streamTimeouts.delete(videoID);
    }
  }

  static getStreamParams(videoID: string) {
    return streamParamsMap.get(videoID);
  }

  static createStreamProcess(videoID: string) {
    const params = streamParamsMap.get(videoID);
    if (!params || params.isConsumed) return undefined;
    params.isConsumed = true; // 标记为已消费
    const { cameraID, duration } = params;
    const platform = os.platform();
    const realName = this.getCameraNameByID(cameraID);
    if (!realName) return undefined;
    let input;
    let args;
    if (platform === 'win32') {
      input = `video=${realName.trim()}`;
      args = ['-f', 'dshow', '-i', input];
    } else {
      input = `/dev/${realName}`;
      args = ['-f', 'v4l2', '-i', input];
    }
    if (duration && duration > 0) {
      args.push('-t', (duration / 10).toString());
    }
    args.push('-f', 'mpegts', '-codec:v', 'mpeg1video', '-b:v', VIDEO_BITRATE, '-r', VIDEO_FPS.toString(), '-s', VIDEO_RESOLUTION, '-');
    const ffmpegBin = typeof ffmpegPath === 'string' ? ffmpegPath : 'ffmpeg';
    const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.on('exit', () => this.clearStreamParams(videoID));
    return proc;
  }

  static async startVideo(cameraID: number | string, absPath?: string, duration?: number): Promise<VideoResult & { videoID?: string, streamUrl?: string }> {
    try {
      const videoID = randomUUID();
      if (!absPath) {
        // 延迟推流：只记录参数，返回 streamUrl
        streamParamsMap.set(videoID, { cameraID, duration, isConsumed: false });
        // 设置超时自动清理
        const timeout = setTimeout(() => this.clearStreamParams(videoID), STREAM_URL_EXPIRE_MS);
        streamTimeouts.set(videoID, timeout);
        return {
          success: true,
          message: '推流录像已准备，等待客户端连接',
          videoID,
          streamUrl: `/video/stream?videoID=${videoID}`
        };
      }
      const platform = os.platform();
      const realName = this.getCameraNameByID(cameraID);
      if (!realName) return { success: false, message: '无效cameraID', error: '无效cameraID' };
      let input;
      let args;
      if (platform === 'win32') {
        input = `video=${realName.trim()}`;
        args = ['-f', 'dshow', '-i', input];
      } else {
        input = `/dev/${realName}`;
        args = ['-f', 'v4l2', '-i', input];
      }
      if (duration && duration > 0) {
        args.push('-t', (duration / 10).toString());
      }
      args.push('-movflags', 'faststart');
      const ffmpegBin = typeof ffmpegPath === 'string' ? ffmpegPath : 'ffmpeg';
      const spawnArgs = [...args, '-y', absPath];
      logger.info(`${ffmpegBin} args is:<${spawnArgs}>`);
      const proc = spawn(ffmpegBin, spawnArgs);
      let exitResolve: () => void;
      const exitPromise = new Promise<void>((resolve) => {
        exitResolve = resolve;
      });
      const ctx: VideoContext = {
        videoID, cameraID: String(cameraID), absPath, proc, stopped: false, exitPromise
      };
      videoContexts.set(videoID, ctx);
      logger.info(`开始录像: ${realName} -> ${absPath} (videoID=${videoID}, duration=${duration})`);
      if (proc.stderr) proc.stderr.on('data', (data) => logger.debug(`[ffmpeg] ${data}`));
      proc.on('exit', (code) => {
        logger.info(`录像进程退出: ${realName}, code=${code}, videoID=${videoID}`);
        ctx.stopped = true;
        exitResolve();
        scheduleVideoContextCleanup(videoID);
      });
      return { success: true, message: '录像已启动', videoPath: absPath, videoID };
    } catch (e) {
      logger.error(`录像启动异常: ${e}`);
      return { success: false, message: '录像启动失败', error: String(e) };
    }
  }

  static async stopVideo(videoID: string): Promise<VideoResult> {
    // 先检查是否是stream模式
    const streamParams = this.getStreamParams(videoID);
    if (streamParams) {
      // 清理stream相关资源
      this.clearStreamParams(videoID);
      return {
        success: true,
        message: '推流已停止'
      };
    }

    const ctx = videoContexts.get(videoID);
    if (!ctx) {
      return { success: false, message: '未找到录像上下文', error: '无效videoID' };
    }
    // 如果进程还在，kill 并等待 exit
    if (!ctx.stopped && ctx.proc.exitCode === null) {
      return new Promise((resolve) => {
        ctx.proc.once('exit', (code) => {
          logger.info(`ffmpeg process exited with code: ${code} (videoID=${videoID})`);
          if (ctx.cleanTimer) clearTimeout(ctx.cleanTimer);
          videoContexts.delete(videoID);
          logger.info(`停止录像: ${ctx.cameraID}, videoID=${videoID}`);
          resolve({
            success: true,
            message: '录像已停止',
            videoPath: ctx.absPath
          });
        });
        // 优雅退出：优先用 'q'，否则 SIGINT
        if (ctx.proc.stdin && !ctx.proc.stdin.destroyed) {
          logger.info('Sending "q" to ffmpeg stdin for graceful stop...');
          ctx.proc.stdin.write('q');
        } else {
          logger.info('Sending SIGINT to ffmpeg process...');
          ctx.proc.kill('SIGINT');
        }
      });
    } else {
      // 已经自动停止，直接返回并清理
      if (ctx.cleanTimer) clearTimeout(ctx.cleanTimer);
      videoContexts.delete(videoID);
      logger.info(`录像已自动停止: ${ctx.cameraID}, videoID=${videoID}`);
      return {
        success: true,
        message: '录像已停止',
        videoPath: ctx.absPath
      };
    }
  }
}
