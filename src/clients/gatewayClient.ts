import EventEmitter from 'events';
import { Device } from '../deviceManager';

export interface GatewayClientOptions {
  logger?: Console | any;
}

export class GatewayClient extends EventEmitter {
  private connected = false;
  private logger: any;

  constructor(options: GatewayClientOptions = {}) {
    super();
    this.logger = options.logger || console;
  }

  async connect() {
    this.logger.debug?.('GatewayClient connecting');
    // In a real implementation we'd authenticate/open socket here
    this.connected = true;
    this.logger.debug?.('GatewayClient connected');
  }

  async disconnect() {
    this.logger.debug?.('GatewayClient disconnecting');
    this.connected = false;
    this.logger.debug?.('GatewayClient disconnected');
  }

  async getDevices(): Promise<Device[]> {
    // Replace with real gateway device enumeration
    this.logger.debug?.('GatewayClient getDevices');
    return [];
  }

  // Simulate an update from the gateway
  simulateDeviceUpdate(d: Device) {
    if (!this.connected) return;
    this.emit('deviceUpdated', d);
  }
}

export default GatewayClient;
