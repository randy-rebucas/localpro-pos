/**
 * QR Code Reader Service
 * Supports camera-based QR code scanning
 */

import jsQR from 'jsqr';

export interface QRReaderConfig {
  enabled: boolean;
  cameraId?: string;
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

  async startScanning(
    videoElement: HTMLVideoElement,
    onScan: (data: string) => void
  ): Promise<boolean> {
    try {
      this.videoElement = videoElement;
      this.listeners.push(onScan);

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment', // Use back camera on mobile
          ...(this.config?.cameraId && { deviceId: this.config.cameraId }),
        },
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = this.stream;
      await videoElement.play();

      // Start scanning for QR codes
      this.scanInterval = setInterval(() => {
        this.scanFrame(videoElement);
      }, 500); // Scan every 500ms

      return true;
    } catch (error) {
      console.error('Failed to start QR scanning:', error);
      return false;
    }
  }

  async stopScanning(): Promise<void> {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.listeners = [];
  }

  private async scanFrame(video: HTMLVideoElement): Promise<void> {
    try {
      // Use a QR code scanning library (like jsQR or html5-qrcode)
      // For now, we'll use a simple canvas-based approach
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) {
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

      // Try to decode QR code
      // Note: This requires a QR code library like jsQR
      // For now, we'll use a placeholder that can be replaced with actual library
      const qrData = await this.decodeQRCode(imageData);
      if (qrData) {
        this.notifyListeners(qrData);
      }
    } catch (error) {
      // Silently fail - scanning is continuous
    }
  }

  private async decodeQRCode(imageData: ImageData): Promise<string | null> {
    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      return code ? code.data : null;
    } catch (error) {
      // Silently fail - scanning is continuous
      return null;
    }
  }

  private notifyListeners(data: string): void {
    this.listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error('Error in QR scan listener:', error);
      }
    });
  }

  onScan(callback: (data: string) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }
}

export const qrReaderService = new QRReaderService();

