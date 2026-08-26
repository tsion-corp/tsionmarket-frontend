import { describe, expect, it } from "vitest";
import {
  broadcastDescription,
  broadcastLabel,
  capTitle,
  screenCaptureConstraints,
  screenPublishOptions,
  sharedSurfaceLabel,
  shouldWarnOnLeave,
  watchUrl,
} from "./broadcast";

describe("watchUrl", () => {
  it("joins an origin and a path", () => {
    expect(watchUrl("https://ark.example", "/casino/arkball")).toBe(
      "https://ark.example/casino/arkball"
    );
  });

  it("does not double the slash when the origin carries a trailing one", () => {
    expect(watchUrl("https://ark.example/", "/casino/arkball")).toBe(
      "https://ark.example/casino/arkball"
    );
  });
});

describe("capTitle", () => {
  it("leaves a short title alone", () => {
    expect(capTitle("Checkers: Ada vs Bo")).toBe("Checkers: Ada vs Bo");
  });

  it("stays inside the 200 character cap the service enforces", () => {
    const title = capTitle("A".repeat(300));
    expect(title.length).toBe(200);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("broadcastDescription", () => {
  it("carries the watch link, which is the only route back where deepLink is not supported", () => {
    expect(
      broadcastDescription("Live checkers on Ark. Watch the match:", "https://ark.example", "/x")
    ).toBe("Live checkers on Ark. Watch the match: https://ark.example/x");
  });
});

describe("screen options", () => {
  it("keeps a static board sharp and lets a moving surface keep its framerate", () => {
    expect(screenPublishOptions("detail").degradationPreference).toBe("maintain-resolution");
    expect(screenPublishOptions("motion").degradationPreference).toBe("maintain-framerate");
  });

  it("pins h264 so the SDK does not override the content hint on an SVC codec", () => {
    expect(screenPublishOptions("detail").videoCodec).toBe("h264");
    expect(screenPublishOptions("motion").videoCodec).toBe("h264");
  });

  it("passes the content hint through to capture and never captures audio", () => {
    const constraints = screenCaptureConstraints("motion") as Record<string, unknown>;
    expect(constraints.contentHint).toBe("motion");
    expect(screenCaptureConstraints("detail").audio).toBe(false);
  });

  it("removes Entire Screen from the picker, which is the point on a trading app", () => {
    const video = screenCaptureConstraints("detail").video as Record<string, unknown>;
    expect(video.monitorTypeSurfaces).toBe("exclude");
    expect(video.displaySurface).toBe("browser");
  });

  it("removes the mid-share surface switcher, so what was agreed stays what is shared", () => {
    const constraints = screenCaptureConstraints("detail") as Record<string, unknown>;
    expect(constraints.surfaceSwitching).toBe("exclude");
    expect(constraints.selfBrowserSurface).toBe("include");
  });
});

describe("sharedSurfaceLabel", () => {
  it("names each surface the browser can report", () => {
    expect(sharedSurfaceLabel("browser")).toBe("a browser tab");
    expect(sharedSurfaceLabel("window")).toBe("one window");
    expect(sharedSurfaceLabel("monitor")).toBe("your entire screen");
  });

  it("returns null when the browser reports nothing", () => {
    expect(sharedSurfaceLabel(undefined)).toBeNull();
  });
});

describe("shouldWarnOnLeave", () => {
  it("warns while a broadcast is running or half-running", () => {
    expect(shouldWarnOnLeave("starting")).toBe(true);
    expect(shouldWarnOnLeave("live")).toBe(true);
    expect(shouldWarnOnLeave("share-stopped")).toBe(true);
  });

  it("stays quiet once nothing is being published", () => {
    expect(shouldWarnOnLeave("idle")).toBe(false);
    expect(shouldWarnOnLeave("ended")).toBe(false);
    expect(shouldWarnOnLeave("error")).toBe(false);
    expect(shouldWarnOnLeave("not-creator")).toBe(false);
    expect(shouldWarnOnLeave("end-failed")).toBe(false);
  });
});

describe("broadcastLabel", () => {
  it("names a broadcast by the title its host chose", () => {
    expect(broadcastLabel({ title: "Chess: Ada vs Bo" })).toBe("Chess: Ada vs Bo");
  });

  it("stays readable when there is no stream, or its title is blank", () => {
    expect(broadcastLabel(null)).toBe("an untitled broadcast");
    expect(broadcastLabel({ title: "   " })).toBe("an untitled broadcast");
  });
});
