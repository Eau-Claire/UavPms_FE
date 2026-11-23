import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { environment } from "../../../../environments/environment";
import {
  FlightControllerBinding,
  FlightControllerResolveResult,
  PairFlightControllerPayload,
} from "../../../models/flight-controller.models";
import { FlightControllerApi } from "./flight-controller-api";

describe("FlightControllerApi", () => {
  let api: FlightControllerApi;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), FlightControllerApi],
    });
    api = TestBed.inject(FlightControllerApi);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it("resolves drone by flight controller UID (GET /flight-controllers/{uid}/drone)", () => {
    const mockResponse = {
      success: true,
      data: {
        registered: true,
        flightControllerUid: "BF-F405-A1B2C3D4",
        drone: {
          id: "drone-uuid-1",
          code: "UAV-001",
          name: "Inspection Drone 01",
        },
        binding: {
          id: "binding-uuid-1",
          droneId: "drone-uuid-1",
          flightControllerUid: "BF-F405-A1B2C3D4",
          isActive: true,
          pairedAt: "2026-10-13T10:00:00Z",
        },
      },
    };

    let result: FlightControllerResolveResult | undefined;
    api.resolveDrone("BF-F405-A1B2C3D4").subscribe((res) => {
      result = res;
    });

    const req = httpTesting.expectOne(
      `${environment.apiBaseUrl}/flight-controllers/BF-F405-A1B2C3D4/drone`
    );
    expect(req.request.method).toBe("GET");
    req.flush(mockResponse);

    expect(result).toBeDefined();
    expect(result?.registered).toBe(true);
    expect(result?.drone?.code).toBe("UAV-001");
    expect(result?.flightControllerUid).toBe("BF-F405-A1B2C3D4");
  });

  it("handles unregistered flight controller response", () => {
    const mockResponse = {
      success: true,
      data: {
        registered: false,
        flightControllerUid: "BF-UNKNOWN-99",
        drone: null,
        binding: null,
      },
    };

    let result: FlightControllerResolveResult | undefined;
    api.resolveDrone("BF-UNKNOWN-99").subscribe((res) => {
      result = res;
    });

    const req = httpTesting.expectOne(
      `${environment.apiBaseUrl}/flight-controllers/BF-UNKNOWN-99/drone`
    );
    expect(req.request.method).toBe("GET");
    req.flush(mockResponse);

    expect(result?.registered).toBe(false);
    expect(result?.drone).toBeNull();
  });

  it("pairs flight controller to a drone (POST /drones/{droneId}/flight-controller)", () => {
    const payload: PairFlightControllerPayload = {
      flightControllerUid: "BF-NEW-FC-001",
      boardIdentifier: "MATEKF405",
      firmwareName: "Betaflight",
      firmwareVersion: "4.5.1",
    };

    const mockResponse = {
      success: true,
      data: {
        id: "binding-uuid-2",
        droneId: "drone-uuid-1",
        flightControllerUid: "BF-NEW-FC-001",
        boardIdentifier: "MATEKF405",
        firmwareName: "Betaflight",
        firmwareVersion: "4.5.1",
        isActive: true,
        pairedAt: "2026-10-13T12:00:00Z",
      },
    };

    let result: FlightControllerBinding | undefined;
    api.pairFlightController("drone-uuid-1", payload).subscribe((res) => {
      result = res;
    });

    const req = httpTesting.expectOne(
      `${environment.apiBaseUrl}/drones/drone-uuid-1/flight-controller`
    );
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(payload);
    req.flush(mockResponse);

    expect(result).toBeDefined();
    expect(result?.flightControllerUid).toBe("BF-NEW-FC-001");
    expect(result?.isActive).toBe(true);
  });

  it("unpairs flight controller from a drone (DELETE /drones/{droneId}/flight-controller)", () => {
    let completed = false;
    api.unpairFlightController("drone-uuid-1").subscribe(() => {
      completed = true;
    });

    const req = httpTesting.expectOne(
      `${environment.apiBaseUrl}/drones/drone-uuid-1/flight-controller`
    );
    expect(req.request.method).toBe("DELETE");
    req.flush({ success: true });

    expect(completed).toBe(true);
  });

  it("gets active binding for a drone (GET /drones/{droneId}/flight-controller)", () => {
    const mockResponse = {
      success: true,
      data: {
        id: "binding-uuid-1",
        droneId: "drone-uuid-1",
        flightControllerUid: "BF-F405-A1B2C3D4",
        isActive: true,
        pairedAt: "2026-10-13T10:00:00Z",
      },
    };

    let result: FlightControllerBinding | null | undefined;
    api.getActiveBinding("drone-uuid-1").subscribe((res) => {
      result = res;
    });

    const req = httpTesting.expectOne(
      `${environment.apiBaseUrl}/drones/drone-uuid-1/flight-controller`
    );
    expect(req.request.method).toBe("GET");
    req.flush(mockResponse);

    expect(result).toBeDefined();
    expect(result?.flightControllerUid).toBe("BF-F405-A1B2C3D4");
  });
});
