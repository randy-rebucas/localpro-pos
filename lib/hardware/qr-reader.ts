/**
 * QR Code Reader Service
 * Supports camera-based QR code scanning
 */

import jsQR from 'jsqr';
import { logger } from '@/lib/logger';

export interface QRReaderConfig {
  enabled: boolean;
  cameraId?: string;
}

export type CameraErrorCode = 'denied' | 'not_found' | 'unsupported' | 'failed';

export class CameraAccessError extends Error {
  readonly code: CameraErrorCode;

  constructor(code: CameraErrorCode, message: string) {
    super(message);
    this.name = 'CameraAccessError';
    this.code = code;
  }
}

class QRReaderService {
  private config: QRReaderConfig | null = null;
  private listeners: Array<(data: string) => void> = [];
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private scanInterval: NodeJS.Timeout | null = null;

  setConfig(config: QRReaderConfig): void {
    this.config = config;
  }

  private mapMediaError(error: DOMException | Error): CameraAccessError {
    const name = 'name' in error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return new CameraAccessError(
        'denied',
        'Camera access denied. Please allow camera permissions in your browser settings and try again.'
      );
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
      return new CameraAccessError(
        'not_found',
        'No camera found. Please connect a camera and try again.'
      );
    }
    return new CameraAccessError('failed', error.message || 'Failed to start QR scanner');
  }

  private getVideoConstraints(): MediaStreamConstraints[] {
    if (this.config?.cameraId) {
      return [{ video: { deviceId: { exact: this.config.cameraId } } }];
    }

    return [
      { video: { facingMode: { ideal: 'environment' } } },
      { video: { facingMode: 'user' } },
      { video: true },
    ];
  }

  private async requestCameraStream(): Promise<MediaStream> {
    const constraintSets = this.getVideoConstraints();
    let lastError: DOMException | Error | null = null;

    for (const constraints of constraintSets) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        lastError = error as DOMException;
        if (lastError.name === 'NotAllowedError' || lastError.name === 'PermissionDeniedError') {
          throw this.mapMediaError(lastError);
        }
      }
    }

    throw this.mapMediaError(lastError || new Error('No camera available'));
  }

  private async playVideo(videoElement: HTMLVideoElement): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await videoElement.play();
        return;
      } catch (error) {
        const mediaError = error as DOMException;
        if (mediaError.name === 'AbortError' && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
          continue;
        }
        throw this.mapMediaError(mediaError);
      }
    }
  }

  async startScanning(
    videoElement: HTMLVideoElement,
    onScan: (data: string) => void
  ): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new CameraAccessError('unsupported', 'Camera is not supported in this browser.');
    }

    await this.stopScanning();

    try {
      this.videoElement = videoElement;
      this.listeners.push(onScan);

      this.stream = await this.requestCameraStream();
      videoElement.srcObject = this.stream;
      videoElement.muted = true;
      videoElement.playsInline = true;

      await this.playVideo(videoElement);

      this.scanInterval = setInterval(() => {
        this.scanFrame(videoElement);
      }, 500);

      return true;
    } catch (error) {
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      if (videoElement) {
        videoElement.srcObject = null;
      }
      this.listeners = [];
      this.videoElement = null;

      if (error instanceof CameraAccessError) {
        if (error.code === 'denied' || error.code === 'not_found') {
          logger.warn('QR scanning unavailable', { code: error.code, message: error.message });
        } else {
          logger.error('Failed to start QR scanning:', error);
        }
        throw error;
      }

      const mapped = this.mapMediaError(error as DOMException);
      logger.error('Failed to start QR scanning:', mapped);
      throw mapped;
    }
  }

  async stopScanning(): Promise<void> {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    if (this.videoElement) {
      try {
        this.videoElement.pause();
        this.videoElement.srcObject = null;
      } catch {
        // Ignore errors during cleanup
      }
      this.videoElement = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.listeners = [];
  }

  private async scanFrame(video: HTMLVideoElement): Promise<void> {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) {
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const qrData = await this.decodeQRCode(imageData);
      if (qrData) {
        this.notifyListeners(qrData);
      }
    } catch {
      // Silently fail - scanning is continuous
    }
  }

  private async decodeQRCode(imageData: ImageData): Promise<string | null> {
    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      return code ? code.data : null;
    } catch {
      return null;
    }
  }

  private notifyListeners(data: string): void {
    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (error) {
        logger.error('Error in QR scan listener:', error);
      }
    });
  }

  onScan(callback: (data: string) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }
}

export const qrReaderService = new QRReaderService();
