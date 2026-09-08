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

import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { UserIconComponent } from "./user-icon.component";
import { UserService } from "../../../../common/service/user/user.service";
import { HttpClientTestingModule } from "@angular/common/http/testing";
import { StubUserService } from "../../../../common/service/user/stub-user.service";
import { NzDropDownModule } from "ng-zorro-antd/dropdown";
import { RouterTestingModule } from "@angular/router/testing";
import { commonTestProviders } from "../../../../common/testing/test-utils";
import { LOGIN } from "../../../../app-routing.constant";

describe("UserIconComponent", () => {
  let component: UserIconComponent;
  let fixture: ComponentFixture<UserIconComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [{ provide: UserService, useClass: StubUserService }, ...commonTestProviders],
      imports: [
        UserIconComponent,
        RouterTestingModule.withRoutes([{ path: "login", component: UserIconComponent }]),
        HttpClientTestingModule,
        NzDropDownModule,
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(UserIconComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("account row", () => {
    it("shows two-letter initials instead of a colored avatar", () => {
      component.user = { ...component.user!, name: "shaivyaa sharma" };
      fixture.detectChanges();

      const avatar = fixture.nativeElement.querySelector(".account-avatar") as HTMLElement;
      expect(avatar.textContent.trim()).toBe("SS");
      expect(fixture.nativeElement.querySelector("texera-user-avatar")).toBeNull();
      expect(fixture.nativeElement.querySelector(".account-name").textContent.trim()).toBe("shaivyaa sharma");
    });

    it("uses the first two letters of a single-word name", () => {
      component.user = { ...component.user!, name: "shaivyaa" };
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector(".account-avatar").textContent.trim()).toBe("SH");
    });

    it("falls back to a placeholder when the name is empty", () => {
      component.user = { ...component.user!, name: "   " };
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector(".account-avatar").textContent.trim()).toBe("?");
    });

    it("does not show a build label", () => {
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector("#build-number")).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain("Build:");
    });
  });

  describe("onClickLogout", () => {
    it("navigates to /login after logout", () => {
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, "navigate").mockResolvedValue(true);
      const userService = TestBed.inject(UserService);
      const logoutSpy = vi.spyOn(userService, "logout").mockImplementation(() => {});

      component.onClickLogout();

      expect(logoutSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy).toHaveBeenCalledWith([LOGIN]);
      expect(LOGIN).toBe("/login");
    });

    it("clears the flarum_remember cookie on logout", () => {
      const router = TestBed.inject(Router);
      vi.spyOn(router, "navigate").mockResolvedValue(true);
      const userService = TestBed.inject(UserService);
      vi.spyOn(userService, "logout").mockImplementation(() => {});
      // Seed the cookie so we can observe it being cleared. jsdom's
      // document.cookie is the test surface here; assigning a value with a
      // past expiry should expire the cookie immediately.
      document.cookie = "flarum_remember=token; path=/;";

      component.onClickLogout();

      expect(document.cookie).not.toContain("flarum_remember=token");
    });
  });
});
