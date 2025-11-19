/**
 * Barcode Scanner Service
 * Supports USB HID barcode scanners and camera-based scanning
 */

export interface BarcodeScannerConfig {
  type: 'keyboard' | 'camera' | 'usb';
  enabled: boolean;
}

class BarcodeScannerService {
  private config: BarcodeScannerConfig | null = null;
  private listeners: Array<(barcode: string) => void> = [];
  private isListening = false;
  private lastScanTime = 0;
  private scanBuffer = '';

  setConfig(config: BarcodeScannerConfig): void {
    this.config = config;
    if (config.enabled) {
      this.startListening();
    } else {
      this.stopListening();
    }
  }

  startListening(): void {
    if (this.isListening) return;
    this.isListening = true;

    // Listen for keyboard input (most USB barcode scanners act as keyboard)
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keypress', this.handleKeyPress);
    }
  }

  stopListening(): void {
    if (!this.isListening) return;
    this.isListening = false;

    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keypress', this.handleKeyPress);
    }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    // Reset buffer if too much time has passed (new scan)
    const now = Date.now();
    if (now - this.lastScanTime > 100) {
      this.scanBuffer = '';
    }
    this.lastScanTime = now;

    // Handle Enter key (end of scan)
    if (event.key === 'Enter') {
      if (this.scanBuffer.trim()) {
        this.notifyListeners(this.scanBuffer.trim());
        this.scanBuffer = '';
      }
      event.preventDefault();
    }
  };

  private handleKeyPress = (event: KeyboardEvent): void => {
    // Build barcode string from key presses
    if (event.key && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      this.scanBuffer += event.key;
    }
  };

  onScan(callback: (barcode: string) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(barcode: string): void {
    this.listeners.forEach(listener => {
      try {
        listener(barcode);
      } catch (error) {
        console.error('Error in barcode scan listener:', error);
      }
    });
  }

  // For manual/camera-based scanning
  scan(barcode: string): void {
    this.notifyListeners(barcode);
  }
}

export const barcodeScannerService = new BarcodeScannerService();

