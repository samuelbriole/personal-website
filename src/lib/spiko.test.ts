import { describe, expect, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";
import { TestClock } from "effect/testing";
import { fallbackSpikoStats, spikoStatsEffect } from "./spiko";

const shareClasses = [
  { symbol: "EUR", fundId: "fund-eur", tokens: [{ network: "Polygon" }, { network: "Zeta" }] },
  { symbol: "USD", fundId: "fund-usd", tokens: [{ network: "Ethereum" }, { network: "Alpha" }] },
];

function totals(
  assets: string,
  orders: string,
  currency = "EUR",
  updatedAt = "2026-10-01T00:00:00Z",
) {
  return {
    totalAssets: { value: assets, currency },
    totalOrders: { value: orders, currency },
    numberOfHolders: 12,
    netAssetValue: { updatedAt },
  };
}

function withFetch(fetch: typeof globalThis.fetch) {
  return spikoStatsEffect.pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, fetch),
  );
}

function fixture(handler: (url: URL) => Response): typeof globalThis.fetch {
  return (input) => Promise.resolve(handler(new URL(input instanceof Request ? input.url : input)));
}

describe("Spiko build-time stats", () => {
  it.effect("limits concurrent totals requests to four", () =>
    Effect.gen(function* () {
      const full = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let active = 0;
      let maximum = 0;
      let completed = 0;
      const client = HttpClient.make((request, url) =>
        Effect.gen(function* () {
          if (url.pathname.endsWith("/share-classes/")) {
            return HttpClientResponse.fromWeb(
              request,
              Response.json(
                Array.from({ length: 9 }, (_, index) => ({
                  symbol: `EUR${index}`,
                  fundId: "fund",
                })),
              ),
            );
          }
          active++;
          maximum = Math.max(maximum, active);
          if (active === 4) yield* Deferred.succeed(full, undefined);
          yield* Deferred.await(release);
          active--;
          completed++;
          return HttpClientResponse.fromWeb(request, Response.json(totals("100", "200")));
        }),
      );
      const fiber = yield* spikoStatsEffect.pipe(
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.forkChild,
      );
      yield* Deferred.await(full);
      expect(active).toBe(4);
      expect(completed).toBe(0);
      yield* Deferred.succeed(release, undefined);
      expect((yield* Fiber.join(fiber)).assetsLabel).toBe("EUR 900");
      expect(maximum).toBe(4);
      expect(completed).toBe(9);
    }),
  );

  it.effect("does not silently turn unexpected defects into milestone stats", () =>
    Effect.gen(function* () {
      const defect = new Error("programming error");
      const exit = yield* spikoStatsEffect.pipe(
        Effect.provideService(
          HttpClient.HttpClient,
          HttpClient.make(() => Effect.die(defect)),
        ),
        Effect.exit,
      );
      expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
    }),
  );

  it.effect("does not retry malformed JSON", () =>
    Effect.gen(function* () {
      let calls = 0;
      const result = yield* withFetch(
        fixture(() => {
          calls++;
          return new Response("{broken JSON");
        }),
      );
      expect(result).toEqual(fallbackSpikoStats);
      expect(calls).toBe(1);
    }),
  );

  it.effect(
    "aggregates FX, picks the latest update, and orders all advertised networks plus Solana",
    () =>
      Effect.gen(function* () {
        const requests: URL[] = [];
        const result = yield* withFetch(
          fixture((url) => {
            requests.push(url);
            if (url.pathname.endsWith("/share-classes/")) return Response.json(shareClasses);
            if (url.pathname.endsWith("/EUR/totals"))
              return Response.json(totals("1000000000", "2000000000"));
            if (url.pathname.endsWith("/USD/totals"))
              return Response.json(
                totals("600000000", "4000000000", "USD", "2026-10-02T00:00:00Z"),
              );
            return Response.json({ fxRate: "0.9" });
          }),
        );
        expect(result).toEqual({
          assetsLabel: "EUR 1.5B+",
          ordersLabel: "EUR 5.6B+",
          networksDetail: "Ethereum, Polygon, Solana, Alpha, Zeta",
          updatedLabel: "Oct 2, 2026",
          isLive: true,
        });
        const fx = requests.find((url) => url.pathname.endsWith("/exchange-rates/latest"));
        expect(fx?.searchParams.get("fundId")).toBe("fund-usd");
        expect(fx?.searchParams.get("baseCurrency")).toBe("USD");
        expect(fx?.searchParams.get("quoteCurrency")).toBe("EUR");
        expect(fx?.searchParams.get("fallbackToAnyOtherFund")).toBe("true");
      }),
  );

  it.effect.each([
    { name: "empty", body: [] },
    { name: "not an array", body: {} },
    { name: "missing fund", body: [{ symbol: "EUR" }] },
  ])("falls back for $name share classes without retrying", ({ body }) =>
    Effect.gen(function* () {
      let calls = 0;
      const result = yield* withFetch(
        fixture(() => {
          calls++;
          return Response.json(body);
        }),
      );
      expect(result).toEqual(fallbackSpikoStats);
      expect(calls).toBe(1);
    }),
  );

  it.effect.each([400, 404, 408, 429])("does not retry HTTP %s", (status) =>
    Effect.gen(function* () {
      let calls = 0;
      const result = yield* withFetch(
        fixture(() => {
          calls++;
          return new Response(null, { status });
        }),
      );
      expect(result).toEqual(fallbackSpikoStats);
      expect(calls).toBe(1);
    }),
  );

  it.effect("retains successful totals, including networks on failed rows", () =>
    Effect.gen(function* () {
      const result = yield* withFetch(
        fixture((url) => {
          if (url.pathname.endsWith("/share-classes/")) return Response.json(shareClasses);
          if (url.pathname.endsWith("/USD/totals")) return new Response(null, { status: 404 });
          return Response.json(totals("1234567890", "7654321000"));
        }),
      );
      expect(result.isLive).toBe(true);
      expect(result.assetsLabel).toBe("EUR 1.2B+");
      expect(result.ordersLabel).toBe("EUR 7.6B+");
      expect(result.networksDetail).toBe("Ethereum, Polygon, Solana, Alpha, Zeta");
    }),
  );

  it.effect.each([
    { name: "failed FX", response: () => new Response(null, { status: 404 }) },
    { name: "zero FX", response: () => Response.json({ fxRate: "0" }) },
    { name: "non-finite FX", response: () => Response.json({ fxRate: "Infinity" }) },
    { name: "malformed FX", response: () => Response.json({ fxRate: "not a rate" }) },
  ])("uses all-or-nothing fallback for $name", ({ response }) =>
    Effect.gen(function* () {
      let fxCalls = 0;
      const result = yield* withFetch(
        fixture((url) => {
          if (url.pathname.endsWith("/share-classes/")) return Response.json(shareClasses);
          if (url.pathname.endsWith("/EUR/totals"))
            return Response.json(totals("1000000000", "2000000000"));
          if (url.pathname.endsWith("/USD/totals"))
            return Response.json(totals("1000000000", "2000000000", "USD"));
          fxCalls++;
          return response();
        }),
      );
      expect(result).toEqual(fallbackSpikoStats);
      expect(fxCalls).toBe(1);
    }),
  );

  it.effect.each([
    { name: "invalid money", row: totals("NaN", "100") },
    { name: "infinite orders", row: totals("100", "Infinity") },
    { name: "invalid timestamp", row: totals("100", "100", "EUR", "not a date") },
    { name: "no positive assets", row: totals("0", "100") },
  ])("falls back for $name", ({ row }) =>
    Effect.gen(function* () {
      let calls = 0;
      const result = yield* withFetch(
        fixture((url) => {
          calls++;
          return Response.json(url.pathname.endsWith("/share-classes/") ? [shareClasses[0]] : row);
        }),
      );
      expect(result).toEqual(fallbackSpikoStats);
      expect(calls).toBe(2);
    }),
  );

  it.effect.each([
    { assets: "1999999", orders: "199999999", assetsLabel: "EUR 0M+", ordersLabel: "EUR 100M+" },
    { assets: "1234.99", orders: "0", assetsLabel: "EUR 1,234", ordersLabel: "EUR 5B+" },
  ])(
    "preserves existing rounding and order fallback ($assets)",
    ({ assets, orders, assetsLabel, ordersLabel }) =>
      Effect.gen(function* () {
        const result = yield* withFetch(
          fixture((url) =>
            Response.json(
              url.pathname.endsWith("/share-classes/")
                ? [{ symbol: "EUR", fundId: "fund" }]
                : { ...totals(assets, orders), netAssetValue: {} },
            ),
          ),
        );
        expect(result).toEqual({
          assetsLabel,
          ordersLabel,
          networksDetail: "Solana",
          updatedLabel: "public milestone",
          isLive: true,
        });
      }),
  );

  it.effect.each(["status", "network"])("bounds transient %s failures to two retries", (mode) =>
    Effect.gen(function* () {
      let calls = 0;
      const first = yield* Deferred.make<void>();
      const fetch: typeof globalThis.fetch = () => {
        calls++;
        Effect.runSync(Deferred.succeed(first, undefined));
        return mode === "network"
          ? Promise.reject(new Error("offline"))
          : Promise.resolve(new Response(null, { status: 503 }));
      };
      const fiber = yield* withFetch(fetch).pipe(Effect.forkChild);
      yield* Deferred.await(first);
      yield* TestClock.adjust("1 second");
      expect(yield* Fiber.join(fiber)).toEqual(fallbackSpikoStats);
      expect(calls).toBe(3);
    }),
  );

  it.effect("recovers after a transient response", () =>
    Effect.gen(function* () {
      let calls = 0;
      const started = yield* Deferred.make<void>();
      const fiber = yield* withFetch(
        fixture(() => {
          calls++;
          Effect.runSync(Deferred.succeed(started, undefined));
          return calls < 3 ? new Response(null, { status: 502 }) : Response.json([]);
        }),
      ).pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* TestClock.adjust("1 second");
      expect(yield* Fiber.join(fiber)).toEqual(fallbackSpikoStats);
      expect(calls).toBe(3);
    }),
  );

  it.effect.each(["headers", "body"])(
    "cancels a request stalled at %s after four seconds",
    (phase) =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        let aborted = false;
        let calls = 0;
        const fetch: typeof globalThis.fetch = (_input, init) => {
          calls++;
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
          });
          if (phase === "headers") {
            Effect.runSync(Deferred.succeed(started, undefined));
            return new Promise(() => {});
          }
          return Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  init?.signal?.addEventListener("abort", () =>
                    controller.error(new Error("aborted")),
                  );
                },
                pull() {
                  Effect.runSync(Deferred.succeed(started, undefined));
                },
              }),
            ),
          );
        };
        const fiber = yield* withFetch(fetch).pipe(Effect.forkChild);
        yield* Deferred.await(started);
        yield* TestClock.adjust("3999 millis");
        expect(aborted).toBe(false);
        yield* TestClock.adjust("1 millis");
        expect(yield* Fiber.join(fiber)).toEqual(fallbackSpikoStats);
        expect(aborted).toBe(true);
        expect(calls).toBe(1);
      }),
  );
});
