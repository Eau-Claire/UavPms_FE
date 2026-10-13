import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { map, Observable } from "rxjs";
import { environment } from "../../../../environments/environment";
import { unwrapApiData } from "../../../models/api.models";
import {
  FlightControllerBinding,
  FlightControllerResolveResult,
  PairFlightControllerPayload,
} from "../../../models/flight-controller.models";

@Injectable({
  providedIn: "root",
})
export class FlightControllerApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  /**
   * Resolves the drone associated with a Betaflight Flight Controller hardware UID.
   * Updates LastSeenAt when an active binding exists.
   */
  resolveDrone(uid: string): Observable<FlightControllerResolveResult> {
    const cleanUid = encodeURIComponent(uid.trim());
    return this.http
      .get<unknown>(`${this.baseUrl}/flight-controllers/${cleanUid}/drone`)
      .pipe(map((res) => unwrapApiData(res) as FlightControllerResolveResult));
  }

  /**
   * Pairs a Flight Controller UID to a Drone.
   * Enforces BR-01, BR-02, BR-03 (deactivates previous binding and preserves history).
   */
  pairFlightController(
    droneId: string,
    payload: PairFlightControllerPayload
  ): Observable<FlightControllerBinding> {
    return this.http
      .post<unknown>(`${this.baseUrl}/drones/${droneId}/flight-controller`, payload)
      .pipe(map((res) => unwrapApiData(res) as FlightControllerBinding));
  }

  /**
   * Unpairs the active Flight Controller from a Drone.
   */
  unpairFlightController(droneId: string): Observable<unknown> {
    return this.http.delete<unknown>(`${this.baseUrl}/drones/${droneId}/flight-controller`);
  }

  /**
   * Retrieves the currently active Flight Controller binding for a Drone.
   */
  getActiveBinding(droneId: string): Observable<FlightControllerBinding | null> {
    return this.http
      .get<unknown>(`${this.baseUrl}/drones/${droneId}/flight-controller`)
      .pipe(map((res) => (unwrapApiData(res) as FlightControllerBinding) || null));
  }
}
