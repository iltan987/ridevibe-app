// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { routeSummary, shareText } from "./places.ts";

const place = (name: string) => ({ name });
const when = "22 Kasım Cumartesi 08:30";
const cancelledTitle = (title: string) => `İPTAL: ${title}`;

test("routeSummary: start → finish for a route, the one name for a meet-up, nothing without places", () => {
  assert.equal(routeSummary([place("Üsküdar"), place("Şile"), place("Ağva")]), "Üsküdar → Ağva");
  assert.equal(routeSummary([place("Moda Sahili")]), "Moda Sahili");
  assert.equal(routeSummary([]), "");
});

test("shareText: title, date line, route, no event link", () => {
  const text = shareText(
    {
      title: "Ağva kahvaltı sürüşü",
      status: "scheduled",
      cancelReason: null,
      places: [place("Üsküdar"), place("Ağva")],
    },
    { when, cancelledTitle },
  );
  assert.equal(text, "Ağva kahvaltı sürüşü\n22 Kasım Cumartesi 08:30\nÜsküdar → Ağva");
});

test("shareText: a scheduled event never shows a leftover reason", () => {
  const text = shareText(
    { title: "Moda buluşması", status: "scheduled", cancelReason: "eski", places: [place("Moda Sahili")] },
    { when, cancelledTitle },
  );
  assert.equal(text, "Moda buluşması\n22 Kasım Cumartesi 08:30\nModa Sahili");
});

test("shareText: a cancelled event leads with the cancellation and its reason", () => {
  const text = shareText(
    { title: "Moda buluşması", status: "cancelled", cancelReason: "Yağmur bekleniyor", places: [place("Moda Sahili")] },
    { when, cancelledTitle },
  );
  assert.equal(text, "İPTAL: Moda buluşması\nYağmur bekleniyor\n22 Kasım Cumartesi 08:30\nModa Sahili");
});

test("shareText: a cancelled event without a reason has no empty line", () => {
  const text = shareText(
    { title: "Moda buluşması", status: "cancelled", cancelReason: null, places: [place("Moda Sahili")] },
    { when, cancelledTitle },
  );
  assert.equal(text, "İPTAL: Moda buluşması\n22 Kasım Cumartesi 08:30\nModa Sahili");
});
