import { CameraManager } from '../camera/cameraManager.js';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import path from 'path';
import fs from 'fs';

const PHOTO_PREFIX = process.env.PHOTO_PREFIX || 'image';
const VIDEO_PREFIX = process.env.VIDEO_PREFIX || 'video';

function sanitizeCameraID(cameraID: string) {
  return cameraID.replace(/[^a-zA-Z0-9_-]/g, '_');
}
function getTimestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '');
}

export function registerCameraTools(server: McpServer) {
  // listCameras
  server.tool(
    'listCameras',
    'List all cameres on the system.',
    {},
    async () => {
      const cameras = await CameraManager.listCameras();
      return {
        success: true,
        content: [{ type: 'text', text: JSON.stringify({ cameras }) }]
      };
    }
  );

  // takePhoto
  server.tool(
    'takePhoto',
    'Take a photo from a camera and save on specified path.',
    {
      cameraID: z.number(),
      filepath: z.string()
    },
    async ({ cameraID, filepath }) => {
      const safeID = sanitizeCameraID(cameraID.toString());
      const timestamp = getTimestamp();
      const filename = `${PHOTO_PREFIX}${safeID}${timestamp}.jpg`;
      const absDir = path.isAbsolute(filepath) ? filepath : path.resolve(process.cwd(), filepath);
      if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });
      const absPath = path.join(absDir, filename);
      const result = await CameraManager.takePhoto(cameraID.toString(), absPath);
      return {
        ...result,
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    }
  );

  // startVideo
  server.tool(
    'startVideo',
    'Start a video from a camera and save on specified path or later get in a stream.',
    {
      cameraID: z.number(),
      filepath: z.string().optional(),
      duration: z.number().optional()
    },
    async ({ cameraID, filepath, duration }) => {
      const safeID = sanitizeCameraID(cameraID.toString());
      const timestamp = getTimestamp();
      let absPath: string | undefined = undefined;
      if (filepath) {
        const filename = `${VIDEO_PREFIX}${safeID}${timestamp}.mp4`;
        const absDir = path.isAbsolute(filepath) ? filepath : path.resolve(process.cwd(), filepath);
        if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });
        absPath = path.join(absDir, filename);
      }
      const result = await CameraManager.startVideo(cameraID.toString(), absPath, duration);
      if (!filepath && result.success && result.videoID && result.streamUrl) {
        return {
          ...result,
          content: [{ type: 'text', text: JSON.stringify({ ...result, streamUrl: result.streamUrl }) }]
        };
      }
      return {
        ...result,
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    }
  );

  // stopVideo
  server.tool(
    'stopVideo',
    'Stop a video from a camera.',
    {
      videoID: z.string()
    },
    async ({ videoID }) => {
      const result = await CameraManager.stopVideo(videoID);
      return {
        ...result,
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    }
  );
}
