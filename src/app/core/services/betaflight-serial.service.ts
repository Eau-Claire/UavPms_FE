import { Injectable, signal } from '@angular/core';
import { FlightControllerMetadata } from '../../models/flight-controller.models';

export type SerialConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SimulatedFcProfile {
  id: string;
  name: string;
  uid: string;
  boardIdentifier: string;
  firmwareName: string;
  firmwareVersion: string;
  deviceName: string;
}

export const SIMULATED_FC_PROFILES: readonly SimulatedFcProfile[] = [
  {
    id: 'f405-speedybee',
    name: 'SpeedyBee F405 V3 (UAV-001 - Đã ghép nối)',
    uid: 'BF-F405-A1B2C3D4',
    boardIdentifier: 'SPEEDYBEEF405V3',
    firmwareName: 'Betaflight',
    firmwareVersion: '4.5.1',
    deviceName: 'EVN-Survey-Hexa-01',
  },
  {
    id: 'f722-matek',
    name: 'Matek F722-SE (UAV-002 - Đã ghép nối)',
    uid: 'BF-F722-E5F6G7H8',
    boardIdentifier: 'MATEKF722',
    firmwareName: 'Betaflight',
    firmwareVersion: '4.5.0',
    deviceName: 'EVN-LineInspector-02',
  },
  {
    id: 'h743-kakute',
    name: 'Holybro Kakute H7 (UAV-003 - Đã ghép nối)',
    uid: 'BF-H743-9A8B7C6D',
    boardIdentifier: 'KAKUTEH7',
    firmwareName: 'Betaflight',
    firmwareVersion: '4.5.2',
    deviceName: 'EVN-Thermal-Drone-03',
  },
  {
    id: 'unregistered-new-fc',
    name: 'Flight Controller Mới Chưa Đăng Ký (Unregistered)',
    uid: 'BF-NEW-FC-UNPAIRED-99',
    boardIdentifier: 'MATEKF405TE',
    firmwareName: 'Betaflight',
    firmwareVersion: '4.5.1',
    deviceName: 'New-Assembled-Quadcopter',
  },
];

const MSP_FC_VARIANT = 2;
const MSP_FC_VERSION = 3;
const MSP_BOARD_INFO = 4;
const MSP_NAME = 11;
const MSP_UID = 160;

@Injectable({
  providedIn: 'root',
})
export class BetaflightSerialService {
  readonly connectionState = signal<SerialConnectionState>('disconnected');
  readonly activeMetadata = signal<FlightControllerMetadata | null>(null);
  readonly isSimulated = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  private port: any = null;
  private reader: any = null;
  private writer: any = null;

  isWebSerialSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async connectRealSerial(): Promise<FlightControllerMetadata> {
    if (!this.isWebSerialSupported()) {
      const err = 'Trình duyệt của bạn không hỗ trợ Web Serial API. Vui lòng sử dụng Google Chrome hoặc Edge, hoặc dùng chế độ Giả lập (Simulator).';
      this.errorMessage.set(err);
      this.connectionState.set('error');
      throw new Error(err);
    }

    try {
      this.connectionState.set('connecting');
      this.errorMessage.set(null);
      this.isSimulated.set(false);

      const nav = navigator as any;
      this.port = await nav.serial.requestPort({
        filters: [
          { usbVendorId: 0x0483 }, // STMicroelectronics
          { usbVendorId: 0x2e3c }, // USB-VCP
          { usbVendorId: 0x1209 }, // pid.codes open-source hardware
        ],
      });

      await this.port.open({ baudRate: 115200 });
      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();

      const metadata = await this.readBetaflightMetadataOverMsp();
      this.activeMetadata.set(metadata);
      this.connectionState.set('connected');
      return metadata;
    } catch (err: any) {
      const message = err?.message || 'Không thể kết nối đến cổng Serial của Flight Controller.';
      this.errorMessage.set(message);
      this.connectionState.set('error');
      await this.disconnect();
      throw err;
    }
  }

  async connectSimulated(profileOrUid?: string): Promise<FlightControllerMetadata> {
    this.connectionState.set('connecting');
    this.errorMessage.set(null);
    this.isSimulated.set(true);

    await new Promise((resolve) => setTimeout(resolve, 200));

    let profile = SIMULATED_FC_PROFILES.find((p) => p.id === profileOrUid || p.uid === profileOrUid);
    if (!profile) {
      if (profileOrUid && profileOrUid.trim()) {
        const clean = profileOrUid.trim().toUpperCase();
        profile = {
          id: 'custom-fc',
          name: `Custom FC (${clean})`,
          uid: clean,
          boardIdentifier: 'STM32F405',
          firmwareName: 'Betaflight',
          firmwareVersion: '4.5.1',
          deviceName: 'Custom-Drone-FC',
        };
      } else {
        profile = SIMULATED_FC_PROFILES[0];
      }
    }

    const metadata: FlightControllerMetadata = {
      uid: profile.uid,
      boardIdentifier: profile.boardIdentifier,
      firmwareName: profile.firmwareName,
      firmwareVersion: profile.firmwareVersion,
      deviceName: profile.deviceName,
      apiVersion: 'MSP v1.45',
    };

    this.activeMetadata.set(metadata);
    this.connectionState.set('connected');
    return metadata;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.reader) {
        await this.reader.cancel().catch(() => {});
        this.reader.releaseLock?.();
        this.reader = null;
      }
      if (this.writer) {
        this.writer.releaseLock?.();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close().catch(() => {});
        this.port = null;
      }
    } catch {
      // Ignore cleanup error
    } finally {
      this.connectionState.set('disconnected');
      this.activeMetadata.set(null);
      this.isSimulated.set(false);
      this.errorMessage.set(null);
    }
  }

  private async readBetaflightMetadataOverMsp(): Promise<FlightControllerMetadata> {
    const uidResponse = await this.sendMspCommand(MSP_UID);
    const uid = this.parseMspUid(uidResponse);

    let firmwareName = 'Betaflight';
    try {
      const variantResp = await this.sendMspCommand(MSP_FC_VARIANT);
      if (variantResp && variantResp.length >= 4) {
        const variantStr = String.fromCharCode(...variantResp.slice(0, 4));
        if (variantStr === 'BTFL') firmwareName = 'Betaflight';
        else if (variantStr === 'INAV') firmwareName = 'INAV';
      }
    } catch {}

    let firmwareVersion = '4.5.0';
    try {
      const versionResp = await this.sendMspCommand(MSP_FC_VERSION);
      if (versionResp && versionResp.length >= 3) {
        firmwareVersion = `${versionResp[0]}.${versionResp[1]}.${versionResp[2]}`;
      }
    } catch {}

    let boardIdentifier = 'STM32F405';
    try {
      const boardResp = await this.sendMspCommand(MSP_BOARD_INFO);
      if (boardResp && boardResp.length >= 4) {
        boardIdentifier = String.fromCharCode(...boardResp.slice(0, 4)).trim() || 'STM32F405';
      }
    } catch {}

    let deviceName = 'Betaflight-Drone';
    try {
      const nameResp = await this.sendMspCommand(MSP_NAME);
      if (nameResp && nameResp.length > 0) {
        deviceName = String.fromCharCode(...nameResp).trim() || 'Betaflight-Drone';
      }
    } catch {}

    return {
      uid,
      boardIdentifier,
      firmwareName,
      firmwareVersion,
      deviceName,
      apiVersion: 'MSP v1.45',
    };
  }

  private parseMspUid(payload: Uint8Array): string {
    if (!payload || payload.length < 12) {
      return 'BF-UID-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    }
    return Array.from(payload)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  private async sendMspCommand(code: number): Promise<Uint8Array> {
    if (!this.writer || !this.reader) {
      throw new Error('Cổng Serial chưa được mở hoặc không khả dụng.');
    }
    const packet = new Uint8Array([36, 77, 60, 0, code, code]);
    await this.writer.write(packet);
    return await this.readMspResponse(code, 800);
  }

  private async readMspResponse(expectedCode: number, timeoutMs = 800): Promise<Uint8Array> {
    const start = Date.now();
    const buffer: number[] = [];

    while (Date.now() - start < timeoutMs) {
      const { value, done } = await this.reader.read();
      if (done) break;
      if (value) {
        for (let i = 0; i < value.length; i++) {
          buffer.push(value[i]);
        }
        for (let i = 0; i <= buffer.length - 6; i++) {
          if (buffer[i] === 36 && buffer[i + 1] === 77 && buffer[i + 2] === 62) {
            const size = buffer[i + 3];
            const code = buffer[i + 4];
            const packetEnd = i + 5 + size + 1;
            if (buffer.length >= packetEnd && code === expectedCode) {
              return new Uint8Array(buffer.slice(i + 5, i + 5 + size));
            }
          }
        }
      }
    }

    throw new Error(`Hết thời gian chờ phản hồi MSP (Mã lệnh: ${expectedCode}).`);
  }
}
