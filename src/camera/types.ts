export interface CameraInfo {
  cameraID: number;
  name: string;
  description: string;
}

export interface TakePhotoResult {
  success: boolean;
  imagePath?: string;
  error?: string;
}

export interface VideoResult {
  success: boolean;
  message: string;
  videoPath?: string;
  error?: string;
}
