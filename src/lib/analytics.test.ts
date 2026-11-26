import { describe, expect, it } from "vitest";
import { cleanEvent, isDeviceId } from "./analyticsSchema";
import { mergeConfig } from "./cloud/configData";

describe("analytics intake", () => {
  it("accepts known events with small primitive props", () => {
    const e = cleanEvent({ name: "plan_built", props: { type: "5day", members: 3, nested: { a: 1 }, "Bad-Key": 1 }, path: "/#secret" })!;
    expect(e.name).toBe("plan_built");
    expect(e.props).toEqual({ type: "5day", members: 3 });
    expect(e.path).toBe("/");
  });

  it("rejects unknown events and clamps long text", () => {
    expect(cleanEvent({ name: "drop_table" })).toBeNull();
    expect(cleanEvent({ name: "plan_built", props: { note: "x".repeat(500) } })!.props.note).toHaveLength(120);
    expect(cleanEvent({ name: "feedback", props: { message: "y".repeat(5000) } })!.props.message).toHaveLength(2000);
  });

  it("only trusts recent client timestamps", () => {
    const old = cleanEvent({ name: "app_opened", at: "2001-01-01T00:00:00Z" })!;
    expect(Date.now() - Date.parse(old.at)).toBeLessThan(5000);
  });

  it("validates device ids", () => {
    expect(isDeviceId("4b3f6f0e-6f1a-4c2b-9a51-0e8d2b1c7a90")).toBe(true);
    expect(isDeviceId("../../etc")).toBe(false);
  });
});

describe("app settings", () => {
  it("fills gaps with defaults and ignores junk rows", () => {
    const c = mergeConfig([{ key: "features", value: { voice: false } }, { key: "announcement", value: null }]);
    expect(c.features.voice).toBe(false);
    expect(c.features.instant).toBe(true);
    expect(c.announcement.text).toBe("");
  });
});
