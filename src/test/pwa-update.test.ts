import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock sonner before importing pwaUpdate
vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

type Listener = (...args: any[]) => void;

class FakeServiceWorker extends EventTarget {
  state: "installing" | "installed" | "activated" = "installing";
  postMessage = vi.fn();
  setState(next: typeof this.state) {
    this.state = next;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeServiceWorker | null = null;
  waiting: FakeServiceWorker | null = null;
  active: FakeServiceWorker | null = new FakeServiceWorker();
  update = vi.fn().mockResolvedValue(undefined);
  unregister = vi.fn().mockResolvedValue(true);
  fireUpdateFound() {
    this.dispatchEvent(new Event("updatefound"));
  }
}

class FakeSWContainer extends EventTarget {
  controller: FakeServiceWorker | null = new FakeServiceWorker();
  registration = new FakeRegistration();
  register = vi.fn().mockImplementation(async () => this.registration);
  getRegistrations = vi.fn().mockResolvedValue([]);
  fireControllerChange() {
    this.dispatchEvent(new Event("controllerchange"));
  }
}

describe("PWA update flow", () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;
  let swContainer: FakeSWContainer;

  beforeEach(() => {
    vi.resetModules();

    // Force production-like environment so initPwaUpdate doesn't bail out
    Object.defineProperty(window, "self", { value: window, configurable: true });
    Object.defineProperty(window, "top", { value: window, configurable: true });

    originalLocation = window.location;
    reloadSpy = vi.fn();
    delete (window as any).location;
    (window as any).location = {
      hostname: "app.example.com",
      reload: reloadSpy,
      href: "https://app.example.com/",
    };

    swContainer = new FakeSWContainer();
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: swContainer,
      configurable: true,
    });
  });

  afterEach(() => {
    (window as any).location = originalLocation;
    vi.restoreAllMocks();
  });

  it("auto-activates a waiting SW and reloads on controllerchange — no stale UI", async () => {
    const { initPwaUpdate } = await import("@/lib/pwaUpdate");
    initPwaUpdate();

    // Trigger the deferred 'load' handler
    window.dispatchEvent(new Event("load"));
    // Allow register() promise to resolve
    await Promise.resolve();
    await Promise.resolve();

    const reg = swContainer.registration;

    // A new SW starts installing
    const newWorker = new FakeServiceWorker();
    reg.installing = newWorker;
    reg.fireUpdateFound();

    // It finishes installing while an old controller is active → "waiting" state
    reg.waiting = newWorker;
    newWorker.setState("installed");

    // App must immediately tell the waiting SW to skipWaiting (no user click required)
    expect(newWorker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });

    // SW activates and takes control → controllerchange fires → page reloads
    swContainer.fireControllerChange();
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // Subsequent controllerchange events do not double-reload
    swContainer.fireControllerChange();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("reloads immediately if a SW was already waiting at first load", async () => {
    const preWaiting = new FakeServiceWorker();
    preWaiting.state = "installed";
    swContainer.registration.waiting = preWaiting;

    const { initPwaUpdate } = await import("@/lib/pwaUpdate");
    initPwaUpdate();
    window.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();

    expect(preWaiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });

    swContainer.fireControllerChange();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
