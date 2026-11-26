import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LegRouter } from "./legs";
import { haversine, pointAlong, type LngLat } from "./geo";
import type { RoutingProvider } from "../providers/RoutingProvider";

/**
 * A fake router: each leg "snaps" its ends 0.0001° north (about 11 m) and
 * passes through one bend point 0.001° north of the straight line.
 */
function fakeRouter(fail?: (a: LngLat, b: LngLat) => boolean) {
  const calls: [LngLat, LngLat][] = [];
  const router: RoutingProvider = {
    name: "fake",
    async route([a, b]) {
      calls.push([a, b]);
      if (fail?.(a, b)) throw new Error("upstream down");
      const sa: LngLat = [a[0], a[1] + 0.0001];
      const sb: LngLat = [b[0], b[1] + 0.0001];
      const bend: LngLat = [(a[0] + b[0]) / 2, (sa[1] + sb[1]) / 2 + 0.001];
      const coordinates = [sa, bend, sb];
      return { coordinates, distance_m: 1000, provider: "fake" };
    },
  };
  return { router, calls };
}

const A: LngLat = [-71.06, 42.36];
const B: LngLat = [-71.07, 42.36];
const C: LngLat = [-71.08, 42.37];
const D: LngLat = [-71.09, 42.38];

describe("LegRouter", () => {
  it("routes each leg on its own and joins them without repeating shared points", async () => {
    const { router, calls } = fakeRouter();
    const r = await new LegRouter(router).route([A, B, C]);

    assert.deepEqual(calls, [
      [A, B],
      [B, C],
    ]);
    assert.equal(r.coordinates.length, 5); // 3 + 3, minus the shared snapped B
    assert.equal(r.distance_m, 2000);
    assert.equal(r.legs.length, 2);
  });

  it("reports where each waypoint attached", async () => {
    const { router } = fakeRouter();
    const r = await new LegRouter(router).route([A, B, C]);
    assert.deepEqual(r.snapped, [
      [A[0], A[1] + 0.0001],
      [B[0], B[1] + 0.0001],
      [C[0], C[1] + 0.0001],
    ]);
  });

  it("puts each leg's midpoint on its path, not on the straight line", async () => {
    const { router } = fakeRouter();
    const r = await new LegRouter(router).route([A, B]);
    const straightMid: LngLat = [(A[0] + B[0]) / 2, A[1] + 0.0001];
    // A to B runs east-west and the fake path bends 0.001° (about 111 m) north,
    // symmetrically, so its midpoint is the bend.
    assert.ok(haversine(r.legs[0].midpoint, straightMid) > 100);
  });

  it("only re-routes the legs that changed", async () => {
    const { router, calls } = fakeRouter();
    const legs = new LegRouter(router);
    await legs.route([A, B, C, D]);
    calls.length = 0;

    const moved: LngLat = [C[0] + 0.001, C[1]];
    await legs.route([A, B, moved, D]);
    assert.deepEqual(calls, [
      [B, moved],
      [moved, D],
    ]);
  });

  it("doesn't cache a failed leg", async () => {
    let down = true;
    const { router, calls } = fakeRouter(() => down);
    const legs = new LegRouter(router);
    await assert.rejects(legs.route([A, B]), /upstream down/);
    down = false;
    await legs.route([A, B]);
    assert.equal(calls.length, 2);
  });

  it("evicts the least recently used leg when the cache is full", async () => {
    const { router, calls } = fakeRouter();
    const legs = new LegRouter(router, { cacheSize: 2, concurrency: 1 });
    await legs.route([A, B]); // cache: AB
    await legs.route([B, C]); // cache: AB, BC
    await legs.route([A, B]); // hit; cache: BC, AB
    await legs.route([C, D]); // evicts BC
    calls.length = 0;

    await legs.route([A, B]);
    assert.equal(calls.length, 0);
    await legs.route([B, C]);
    assert.deepEqual(calls, [[B, C]]);
  });
});

describe("pointAlong", () => {
  const line: LngLat[] = [
    [0, 0],
    [0, 0.001],
    [0, 0.002],
  ];
  it("interpolates within a segment", () => {
    const half = haversine(line[0], line[2]) / 2;
    const p = pointAlong(line, half);
    assert.ok(Math.abs(p[1] - 0.001) < 1e-9);
  });
  it("clamps past the end", () => {
    assert.deepEqual(pointAlong(line, 1e9), [0, 0.002]);
  });
});
