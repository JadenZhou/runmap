import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { BRouterProvider } from "./RoutingProvider";
import type { LngLat } from "../lib/geo";

const BASE = "https://brouter.test/brouter";
const WAYPOINTS: LngLat[] = [
  [-71.0776, 42.3499],
  [-71.0952, 42.3488],
];

/** A BRouter GeoJSON answer for a two-point track. */
const TRACK = {
  features: [
    {
      properties: { "track-length": "1640" },
      geometry: {
        coordinates: [
          [-71.0776, 42.3499, 10],
          [-71.0952, 42.3488, 12],
        ],
      },
    },
  ],
};

type Handler = (url: string, init?: RequestInit) => Response;
let calls: { url: string; init?: RequestInit }[];
const realFetch = globalThis.fetch;

function mockFetch(handler: Handler) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const routeCalls = () => calls.filter((c) => !c.url.endsWith("/profile"));
const uploadCalls = () => calls.filter((c) => c.url.endsWith("/profile"));
const profileParam = (url: string) => new URL(url).searchParams.get("profile");

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("BRouterProvider with the local running profile", () => {
  const provider = () =>
    new BRouterProvider({
      profile: "running",
      base: BASE,
      loadProfile: async () => "---context:global\n",
    });

  it("uploads the profile once and routes with the id BRouter returns", async () => {
    mockFetch((url) => (url.endsWith("/profile") ? json({ profileid: "custom_1" }) : json(TRACK)));
    const p = provider();
    const first = await p.route(WAYPOINTS);
    await p.route(WAYPOINTS);

    assert.equal(uploadCalls().length, 1);
    assert.equal(uploadCalls()[0].init?.body, "---context:global\n");
    assert.deepEqual(
      routeCalls().map((c) => profileParam(c.url)),
      ["custom_1", "custom_1"],
    );
    assert.equal(first.distance_m, 1640);
    assert.deepEqual(first.coordinates[0], [-71.0776, 42.3499]); // elevation dropped
  });

  it("re-uploads and retries once when BRouter has forgotten the profile", async () => {
    let uploads = 0;
    mockFetch((url) => {
      if (url.endsWith("/profile")) return json({ profileid: `custom_${++uploads}` });
      // The first id has expired; the fresh one works.
      return profileParam(url) === "custom_1" ? new Response("", { status: 500 }) : json(TRACK);
    });
    const result = await provider().route(WAYPOINTS);

    assert.equal(result.distance_m, 1640);
    assert.deepEqual(
      routeCalls().map((c) => profileParam(c.url)),
      ["custom_1", "custom_2"],
    );
  });

  it("gives up after one retry", async () => {
    mockFetch((url) =>
      url.endsWith("/profile")
        ? json({ profileid: "custom_1" })
        : new Response("", { status: 500 }),
    );
    await assert.rejects(provider().route(WAYPOINTS), /Upstream 500/);
    assert.equal(routeCalls().length, 2);
  });

  it("does not retry other upstream errors", async () => {
    mockFetch((url) =>
      url.endsWith("/profile")
        ? json({ profileid: "custom_1" })
        : new Response("", { status: 503 }),
    );
    await assert.rejects(provider().route(WAYPOINTS), /Upstream 503/);
    assert.equal(routeCalls().length, 1);
  });

  it("reports a profile BRouter can't parse, and tries the upload again next time", async () => {
    mockFetch(() => json({ profileid: "custom_9", error: "ParseException at line 3" }));
    const p = provider();
    await assert.rejects(p.route(WAYPOINTS), /rejected profile "running": ParseException/);
    await assert.rejects(p.route(WAYPOINTS), /ParseException/);
    assert.equal(uploadCalls().length, 2);
    assert.equal(routeCalls().length, 0);
  });
});

describe("BRouterProvider with a built-in profile", () => {
  it("routes directly without uploading anything", async () => {
    mockFetch(() => json(TRACK));
    await new BRouterProvider({ profile: "trekking", base: BASE }).route(WAYPOINTS);

    assert.equal(uploadCalls().length, 0);
    assert.equal(profileParam(routeCalls()[0].url), "trekking");
  });
});
