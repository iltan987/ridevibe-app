// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { memberShareText, routeSummary, shareText } from "./places.ts";

const place = (name: string) => ({ name });
const when = "22 Kasım Cumartesi 08:30";
const url = "https://ridevibe.com.tr/events/abc";
const cancelledTitle = (title: string) => `İPTAL: ${title}`;

test("routeSummary: start → finish for a route, the one name for a meet-up, nothing without places", () => {
  assert.equal(routeSummary([place("Üsküdar"), place("Şile"), place("Ağva")]), "Üsküdar → Ağva");
  assert.equal(routeSummary([place("Moda Sahili")]), "Moda Sahili");
  assert.equal(routeSummary([]), "");
});

test("shareText: title, date line, route, event link last", () => {
  const text = shareText(
    {
      title: "Ağva kahvaltı sürüşü",
      status: "scheduled",
      cancelReason: null,
      places: [place("Üsküdar"), place("Ağva")],
    },
    { when, cancelledTitle, changeLead: null, url },
  );
  assert.equal(text, "Ağva kahvaltı sürüşü\n22 Kasım Cumartesi 08:30\nÜsküdar → Ağva\n" + url);
});

test("shareText: a scheduled event never shows a leftover reason", () => {
  const text = shareText(
    { title: "Moda buluşması", status: "scheduled", cancelReason: "eski", places: [place("Moda Sahili")] },
    { when, cancelledTitle, changeLead: null, url },
  );
  assert.equal(text, "Moda buluşması\n22 Kasım Cumartesi 08:30\nModa Sahili\n" + url);
});

test("shareText: a cancelled event leads with the cancellation and its reason", () => {
  const text = shareText(
    { title: "Moda buluşması", status: "cancelled", cancelReason: "Yağmur bekleniyor", places: [place("Moda Sahili")] },
    { when, cancelledTitle, changeLead: null, url },
  );
  assert.equal(text, "İPTAL: Moda buluşması\nYağmur bekleniyor\n22 Kasım Cumartesi 08:30\nModa Sahili\n" + url);
});

test("shareText: a cancelled event without a reason has no empty line", () => {
  const text = shareText(
    { title: "Moda buluşması", status: "cancelled", cancelReason: null, places: [place("Moda Sahili")] },
    { when, cancelledTitle, changeLead: null, url },
  );
  assert.equal(text, "İPTAL: Moda buluşması\n22 Kasım Cumartesi 08:30\nModa Sahili\n" + url);
});

test("shareText: a change lead is the first line of a scheduled event", () => {
  const text = shareText(
    { title: "Ağva kahvaltı sürüşü", status: "scheduled", cancelReason: null, places: [place("Ağva")] },
    { when, cancelledTitle, changeLead: "Güncellendi: saat 09:00", url },
  );
  assert.equal(text, "Güncellendi: saat 09:00\nAğva kahvaltı sürüşü\n22 Kasım Cumartesi 08:30\nAğva\n" + url);
});

test("shareText: on a cancelled event the cancellation wins over a change lead", () => {
  const text = shareText(
    { title: "Ağva", status: "cancelled", cancelReason: "Yağmur", places: [] },
    { when, cancelledTitle, changeLead: "Güncellendi: saat 09:00", url },
  );
  assert.equal(text, "İPTAL: Ağva\nYağmur\n22 Kasım Cumartesi 08:30\n" + url);
});

test("memberShareText: title, day and link, nothing else", () => {
  assert.equal(
    memberShareText({ title: "Ağva", status: "scheduled" }, { day: "29 Kasım Cumartesi", cancelledTitle, url }),
    `Ağva\n29 Kasım Cumartesi\n${url}`,
  );
});

test("memberShareText: a cancelled event leads with the cancellation, the link stays last", () => {
  const lines = memberShareText(
    { title: "Ağva", status: "cancelled" },
    { day: "29 Kasım Cumartesi", cancelledTitle, url },
  ).split("\n");
  assert.equal(lines[0], cancelledTitle("Ağva"));
  assert.equal(lines.at(-1), url);
});
