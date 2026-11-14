// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMotorcycles, parseSafetyContacts } from "./rpc-json.ts";

test("parseMotorcycles keeps well-formed bikes (plate optional or null)", () => {
  assert.deepEqual(
    parseMotorcycles([
      { brand: "Yamaha", model: "MT-07", cc: 689, plate: "34 ABC 123" },
      { brand: "Honda", model: "PCX", cc: null, plate: null },
      { brand: "Vespa", model: "GTS", cc: 300 },
    ]),
    [
      { brand: "Yamaha", model: "MT-07", cc: 689, plate: "34 ABC 123" },
      { brand: "Honda", model: "PCX", cc: null, plate: null },
      { brand: "Vespa", model: "GTS", cc: 300 },
    ],
  );
});

test("parseMotorcycles: not an array → [], malformed items are dropped", () => {
  assert.deepEqual(parseMotorcycles(null), []);
  assert.deepEqual(parseMotorcycles({ brand: "Yamaha" }), []);
  assert.deepEqual(parseMotorcycles([{ brand: "Yamaha", model: "MT-07", cc: "689" }, "x", null]), []);
});

test("parseSafetyContacts keeps well-formed contacts, drops the rest", () => {
  const ok = { position: 1, name: "Ayşe", relationship: "parent", phone: "+905321234567" };
  assert.deepEqual(parseSafetyContacts([ok]), [ok]);
  assert.deepEqual(
    parseSafetyContacts([
      { ...ok, relationship: "boss" },
      { ...ok, position: "2" },
    ]),
    [],
  );
  assert.deepEqual(parseSafetyContacts("[]"), []);
});
