import { Effect, Schedule, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse, type HttpClientError } from "effect/http";

const SPIKO_PUBLIC_API = "https://public-api.spiko.io/v0";
const ShareClass = Schema.Struct({
  symbol: Schema.NonEmptyString,
  fundId: Schema.NonEmptyString,
  tokens: Schema.optionalKey(Schema.Array(Schema.Struct({ network: Schema.String }))),
});
const Money = Schema.Struct({
  value: Schema.FiniteFromString,
  currency: Schema.Literals(["EUR", "USD", "GBP", "CHF", "JPY", "SGD"]),
});
const ShareClassTotals = Schema.Struct({
  totalAssets: Money,
  totalOrders: Money,
  numberOfHolders: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  netAssetValue: Schema.optionalKey(
    Schema.Struct({ updatedAt: Schema.optionalKey(Schema.DateFromString) }),
  ),
});
const ExchangeRate = Schema.Struct({
  fxRate: Schema.FiniteFromString.check(Schema.isGreaterThan(0)),
});

export interface SpikoStats {
  assetsLabel: string;
  ordersLabel: string;
  networksDetail: string;
  updatedLabel: string;
  isLive: boolean;
}

export const fallbackSpikoStats: SpikoStats = {
  assetsLabel: "EUR 1.5B+",
  ordersLabel: "EUR 5B+",
  networksDetail: "Ethereum, Polygon, Base, Arbitrum, Starknet, Stellar, Etherlink, Solana",
  updatedLabel: "public milestone",
  isLive: false,
};

const SPIKO_NETWORK_ORDER = [
  "Ethereum",
  "Polygon",
  "Base",
  "Arbitrum",
  "Starknet",
  "Stellar",
  "Etherlink",
  "Solana",
];

class SpikoDataError extends Schema.TaggedError<SpikoDataError>()("SpikoDataError", {
  message: Schema.String,
}) {}

function formatLargeEurAmount(value: number) {
  if (value >= 1_000_000_000) {
    const roundedDown = Math.floor((value / 1_000_000_000) * 10) / 10;
    return `EUR ${roundedDown.toFixed(1)}B+`;
  }
  if (value >= 1_000_000) {
    const roundedDown = Math.floor(value / 100_000_000) * 100;
    return `EUR ${roundedDown}M+`;
  }
  return `EUR ${Math.floor(value).toLocaleString("en-US")}`;
}

function formatUpdatedAt(value: Date | undefined) {
  if (!value) return fallbackSpikoStats.updatedLabel;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatNetworkNames(networks: string[]) {
  return Array.from(new Set(networks.filter(Boolean)))
    .sort((networkA, networkB) => {
      const indexA = SPIKO_NETWORK_ORDER.indexOf(networkA);
      const indexB = SPIKO_NETWORK_ORDER.indexOf(networkB);
      if (indexA === -1 && indexB === -1) return networkA.localeCompare(networkB);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    })
    .join(", ");
}

const getJson = Effect.fn("Spiko.getJson")(function* <S extends Schema.Constraint>(
  path: string,
  schema: S,
) {
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.withScope,
    HttpClient.filterStatusOk,
    HttpClient.retryTransient({
      retryOn: "errors-only",
      times: 2,
      schedule: Schedule.exponential("100 millis").pipe(
        Schedule.setInputType<HttpClientError.HttpClientError>(),
        Schedule.while(
          ({ input }) =>
            input.reason._tag !== "StatusCodeError" || input.reason.response.status >= 500,
        ),
      ),
    }),
  );
  // The scope owns the transport through body decoding, including on timeout.
  // Retry only the GET, never JSON/schema failures; cap the entire request at 4s.
  return yield* client
    .get(`${SPIKO_PUBLIC_API}${path}`)
    .pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
      Effect.scoped,
      Effect.timeout("4 seconds"),
    );
});

const loadSpikoStats = Effect.fn("Spiko.loadStats")(function* () {
  const shareClasses = yield* getJson("/share-classes/", Schema.Array(ShareClass));
  const totals = yield* Effect.forEach(
    shareClasses,
    (shareClass) =>
      getJson(
        `/share-classes/${encodeURIComponent(shareClass.symbol)}/totals`,
        ShareClassTotals,
      ).pipe(
        Effect.map((totals) => [{ shareClass, totals }]),
        Effect.catch((error) =>
          Effect.logWarning(`Spiko totals unavailable for ${shareClass.symbol}`, error).pipe(
            Effect.as([]),
          ),
        ),
      ),
    { concurrency: 4 },
  );
  const rows = totals.flat().filter(({ totals }) => totals.totalAssets.value > 0);
  if (rows.length === 0) {
    return yield* new SpikoDataError({ message: "No positive Spiko totals available" });
  }

  const currencies = Array.from(
    new Set(
      rows.flatMap(({ totals }) => [totals.totalAssets.currency, totals.totalOrders.currency]),
    ),
  );
  const rates = new Map<string, number>([["EUR", 1]]);
  yield* Effect.forEach(
    currencies.filter((currency) => currency !== "EUR"),
    Effect.fn("Spiko.loadExchangeRate")(function* (currency) {
      const row = rows.find(
        ({ totals }) =>
          totals.totalAssets.currency === currency || totals.totalOrders.currency === currency,
      );
      if (!row) return yield* new SpikoDataError({ message: `Missing fund for ${currency}` });
      const rate = yield* getJson(
        `/exchange-rates/latest?fundId=${encodeURIComponent(row.shareClass.fundId)}&baseCurrency=${currency}&quoteCurrency=EUR&fallbackToAnyOtherFund=true`,
        ExchangeRate,
      );
      rates.set(currency, rate.fxRate);
    }),
    { concurrency: 4, discard: true },
  );
  const convert = (money: typeof Money.Type) => {
    const rate = rates.get(money.currency);
    return rate === undefined
      ? Effect.fail(new SpikoDataError({ message: `Missing EUR rate for ${money.currency}` }))
      : Effect.succeed(money.value * rate);
  };
  const assets = yield* Effect.forEach(rows, ({ totals }) => convert(totals.totalAssets));
  const orders = yield* Effect.forEach(rows, ({ totals }) => convert(totals.totalOrders));
  const totalAssetsInEur = assets.reduce((sum, value) => sum + value, 0);
  const totalOrdersInEur = orders.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(totalAssetsInEur) || totalAssetsInEur <= 0) {
    return yield* new SpikoDataError({ message: "Invalid aggregate Spiko assets" });
  }
  if (!Number.isFinite(totalOrdersInEur) || totalOrdersInEur <= 0) {
    yield* Effect.logWarning("Spiko order total unavailable; using public milestone orders");
  }
  const latestUpdate = rows
    .map(({ totals }) => totals.netAssetValue?.updatedAt)
    .filter((value): value is Date => value !== undefined)
    .sort((a, b) => a.getTime() - b.getTime())
    .at(-1);
  const networksDetail = formatNetworkNames(
    shareClasses
      .flatMap((shareClass) => shareClass.tokens?.map(({ network }) => network) ?? [])
      .concat("Solana"),
  );
  return {
    assetsLabel: formatLargeEurAmount(totalAssetsInEur),
    ordersLabel:
      Number.isFinite(totalOrdersInEur) && totalOrdersInEur > 0
        ? formatLargeEurAmount(totalOrdersInEur)
        : fallbackSpikoStats.ordersLabel,
    networksDetail: networksDetail || fallbackSpikoStats.networksDetail,
    updatedLabel: formatUpdatedAt(latestUpdate),
    isLive: true,
  };
});

export const spikoStatsEffect = loadSpikoStats().pipe(
  Effect.catch((error) =>
    Effect.logWarning("Spiko live stats unavailable; using public milestone", error).pipe(
      Effect.as(fallbackSpikoStats),
    ),
  ),
);

export function fetchSpikoStats(): Promise<SpikoStats> {
  return Effect.runPromise(spikoStatsEffect.pipe(Effect.provide(FetchHttpClient.layer)));
}
