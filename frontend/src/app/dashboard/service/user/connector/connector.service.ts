/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, throwError } from "rxjs";
import { catchError, map, switchMap } from "rxjs/operators";
import { AppSettings } from "../../../../common/app-setting";
import {
  ConnectorType,
  CreateConnectorRequest,
  mapSavedConnector,
  SavedConnector,
  SavedConnectorResponse,
  UpdateConnectorRequest,
} from "../../../type/connector";

export const CONNECTORS_BASE_URL = "connectors";

export class ConnectorTestError extends Error {
  constructor(
    message: string,
    readonly connector: SavedConnector
  ) {
    super(message);
    this.name = "ConnectorTestError";
  }
}

@Injectable({
  providedIn: "root",
})
export class ConnectorService {
  constructor(private http: HttpClient) {}

  listConnectorTypes(): Observable<ConnectorType[]> {
    return this.http.get<ConnectorType[]>(this.url("types"));
  }

  listConnectors(): Observable<SavedConnector[]> {
    return this.http.get<SavedConnectorResponse[]>(this.url()).pipe(map(rows => rows.map(mapSavedConnector)));
  }

  getConnector(id: string): Observable<SavedConnector> {
    return this.listConnectors().pipe(
      map(connectors => {
        const found = connectors.find(connector => connector.id === id);
        if (!found) {
          throw new Error(`Unknown connector "${id}"`);
        }
        return found;
      })
    );
  }

  createConnector(request: CreateConnectorRequest): Observable<SavedConnector> {
    return this.http.post<SavedConnectorResponse>(this.url(), request).pipe(map(mapSavedConnector));
  }

  updateConnector(id: string, patch: UpdateConnectorRequest): Observable<SavedConnector> {
    return this.http.patch<SavedConnectorResponse>(this.url(id), patch).pipe(map(mapSavedConnector));
  }

  testConnector(id: string): Observable<SavedConnector> {
    return this.http.post<SavedConnectorResponse>(this.url(id, "test"), {}).pipe(
      map(mapSavedConnector),
      catchError((err: unknown) => throwError(() => new Error(connectorErrorMessage(err))))
    );
  }

  /**
   * POST /connectors then POST /connectors/{id}/test.
   * Test failure does not emit a successful (Active) connector.
   */
  createAndTest(request: CreateConnectorRequest): Observable<SavedConnector> {
    return this.createConnector(request).pipe(
      switchMap(created =>
        this.testConnector(created.id).pipe(
          catchError((err: unknown) => {
            const message = err instanceof Error ? err.message : connectorErrorMessage(err);
            return throwError(
              () =>
                new ConnectorTestError(message, {
                  ...created,
                  status: "error",
                  lastError: message,
                })
            );
          })
        )
      )
    );
  }

  deleteConnector(id: string): Observable<void> {
    return this.http.delete(this.url(id)).pipe(map(() => undefined));
  }

  listTables(id: string): Observable<string[]> {
    return this.http.get<unknown>(this.url(id, "tables")).pipe(
      map(body => {
        if (!Array.isArray(body)) {
          return [];
        }
        return body.filter((name): name is string => typeof name === "string" && name.trim() !== "");
      })
    );
  }

  private url(...parts: string[]): string {
    return [AppSettings.getApiEndpoint(), CONNECTORS_BASE_URL, ...parts].join("/");
  }
}

export function connectorErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error;
    if (typeof body === "string" && body.trim()) {
      return body;
    }
    if (body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string") {
      return (body as { message: string }).message;
    }
    if (err.message) {
      return err.message;
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Request failed.";
}
