import { describe, expect, it } from "vitest";
import { adminHostnames, isAdminDocument, isAdminLocation, pathAdminHostnames, shouldRedirectAdminPath } from "./adminHost";

describe("admin hostnames", () => {
  it("always includes the production dashboard domain", () => {
    // "" rather than undefined: undefined would read VITE_ADMIN_HOSTNAMES from the environment.
    expect(adminHostnames("")).toEqual(["dashboard.themanvan.co.uk"]);
    expect(adminHostnames(" , ")).toEqual(["dashboard.themanvan.co.uk"]);
  });

  it("keeps only the hostname when a URL, port or path is configured by mistake", () => {
    expect(adminHostnames("https://Staging.Example.com:8443/admin, http://preview.example.org/")).toEqual([
      "dashboard.themanvan.co.uk", "staging.example.com", "preview.example.org"
    ]);
  });

  it("adds configured staging hosts without replacing the default", () => {
    expect(adminHostnames(" Staging.Example.com , preview.example.org,,")).toEqual([
      "dashboard.themanvan.co.uk", "staging.example.com", "preview.example.org"
    ]);
  });
});

describe("isAdminLocation", () => {
  const hosts = adminHostnames("staging.example.com");

  it("gives the dashboard domain every path", () => {
    expect(isAdminLocation("dashboard.themanvan.co.uk", "/", hosts)).toBe(true);
    expect(isAdminLocation("dashboard.themanvan.co.uk", "/anything", hosts)).toBe(true);
    expect(isAdminLocation("staging.example.com", "/", hosts)).toBe(true);
  });

  it("path-gates localhost so one dev server shows both apps", () => {
    expect(isAdminLocation("localhost", "/admin", hosts)).toBe(true);
    expect(isAdminLocation("localhost", "/admin/", hosts)).toBe(true);
    expect(isAdminLocation("localhost", "/", hosts)).toBe(false);
  });

  it("keeps the driver app on every other host", () => {
    expect(isAdminLocation("chat.themanvan.co.uk", "/", hosts)).toBe(false);
    expect(isAdminLocation("chat.themanvan.co.uk", "/admin", hosts)).toBe(false);
    expect(isAdminLocation("127.0.0.1", "/admin", hosts)).toBe(false);
  });
});

describe("retired /temp (classic admin)", () => {
  const hosts = adminHostnames("staging.example.com");
  const pathHosts = pathAdminHostnames("tmv.elevariq.tech");

  it("never mounts an admin at /temp", () => {
    for (const host of ["localhost", "dashboard.themanvan.co.uk", "staging.example.com", "tmv.elevariq.tech", "chat.themanvan.co.uk"]) {
      expect(isAdminLocation(host, "/temp", hosts, pathHosts)).toBe(false);
      expect(isAdminLocation(host, "/temp/", hosts, pathHosts)).toBe(false);
    }
  });

  it("redirects /temp to / on every host, including admin hosts and localhost", () => {
    for (const host of ["localhost", "dashboard.themanvan.co.uk", "staging.example.com", "tmv.elevariq.tech", "chat.themanvan.co.uk"]) {
      expect(shouldRedirectAdminPath(host, "/temp", hosts, pathHosts)).toBe(true);
    }
    expect(shouldRedirectAdminPath("dashboard.themanvan.co.uk", "/temporary", hosts, pathHosts)).toBe(false);
  });
});

describe("shouldRedirectAdminPath", () => {
  const hosts = adminHostnames("");

  it("redirects /admin away from hosts that do not serve the admin", () => {
    expect(shouldRedirectAdminPath("chat.themanvan.co.uk", "/admin", hosts)).toBe(true);
    expect(shouldRedirectAdminPath("chat.themanvan.co.uk", "/", hosts)).toBe(false);
  });

  it("leaves admin hosts and localhost alone", () => {
    expect(shouldRedirectAdminPath("dashboard.themanvan.co.uk", "/admin", hosts)).toBe(false);
    expect(shouldRedirectAdminPath("localhost", "/admin", hosts)).toBe(false);
  });
});

describe("path-gated demo hosts", () => {
  const hosts = adminHostnames("");
  const pathHosts = pathAdminHostnames("https://TMV.Elevariq.tech/");

  it("always includes localhost and keeps only the hostname", () => {
    expect(pathAdminHostnames("")).toEqual(["localhost"]);
    expect(pathHosts).toEqual(["localhost", "tmv.elevariq.tech"]);
  });

  it("shows the driver app at / and the admin at /admin, like localhost", () => {
    expect(isAdminLocation("tmv.elevariq.tech", "/", hosts, pathHosts)).toBe(false);
    expect(isAdminLocation("tmv.elevariq.tech", "/admin", hosts, pathHosts)).toBe(true);
  });

  it("does not redirect /admin away", () => {
    expect(shouldRedirectAdminPath("tmv.elevariq.tech", "/admin", hosts, pathHosts)).toBe(false);
    expect(shouldRedirectAdminPath("chat.themanvan.co.uk", "/admin", hosts, pathHosts)).toBe(true);
  });
});

describe("isAdminDocument", () => {
  it("is true only while <html> carries the admin class", () => {
    expect(isAdminDocument()).toBe(false);
    document.documentElement.classList.add("tmv-admin");
    expect(isAdminDocument()).toBe(true);
    document.documentElement.classList.remove("tmv-admin");
    expect(isAdminDocument(undefined)).toBe(false);
  });
});
