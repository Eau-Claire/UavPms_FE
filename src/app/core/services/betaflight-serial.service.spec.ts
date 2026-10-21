import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BetaflightSerialService, SIMULATED_FC_PROFILES } from "./betaflight-serial.service";

describe("BetaflightSerialService", () => {
  let service: BetaflightSerialService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BetaflightSerialService],
    });
    service = TestBed.inject(BetaflightSerialService);
  });

  afterEach(async () => {
    await service.disconnect();
  });

  it("initializes in disconnected state", () => {
    expect(service.connectionState()).toBe("disconnected");
    expect(service.activeMetadata()).toBeNull();
    expect(service.isSimulated()).toBe(false);
    expect(service.errorMessage()).toBeNull();
  });

  it("connects to a simulated preset profile correctly", async () => {
    const preset = SIMULATED_FC_PROFILES[0];
    const meta = await service.connectSimulated(preset.id);

    expect(service.connectionState()).toBe("connected");
    expect(service.isSimulated()).toBe(true);
    expect(meta.uid).toBe(preset.uid);
    expect(meta.boardIdentifier).toBe(preset.boardIdentifier);
    expect(meta.firmwareName).toBe(preset.firmwareName);
    expect(service.activeMetadata()?.uid).toBe(preset.uid);
  });

  it("connects to a custom simulated UID correctly", async () => {
    const meta = await service.connectSimulated("CUSTOM-FC-ABC-123");

    expect(service.connectionState()).toBe("connected");
    expect(service.isSimulated()).toBe(true);
    expect(meta.uid).toBe("CUSTOM-FC-ABC-123");
    expect(service.activeMetadata()?.uid).toBe("CUSTOM-FC-ABC-123");
  });

  it("disconnects and cleans up connection state", async () => {
    await service.connectSimulated();
    expect(service.connectionState()).toBe("connected");

    await service.disconnect();
    expect(service.connectionState()).toBe("disconnected");
    expect(service.activeMetadata()).toBeNull();
    expect(service.isSimulated()).toBe(false);
  });

  it("handles connectRealSerial gracefully when Web Serial is not supported", async () => {
    vi.spyOn(service, "isWebSerialSupported").mockReturnValue(false);

    await expect(service.connectRealSerial()).rejects.toThrow();
    expect(service.connectionState()).toBe("error");
    expect(service.errorMessage()).toContain("Web Serial API");
  });
});
