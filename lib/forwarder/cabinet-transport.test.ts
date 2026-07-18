import assert from "node:assert";
import { transportModeFromCabinetName, resolveTransportMode } from "./cabinet-transport";

let passed = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); passed++; };

// SEA — GZS prefix + SEA token
ok(transportModeFromCabinetName("GZS260529-1") === "2", "GZS = sea");
ok(transportModeFromCabinetName("CBX260616-SEA01") === "2", "CBX…SEA = sea");
ok(transportModeFromCabinetName("MO20260523-SEA02") === "2", "MO…SEA = sea");
ok(transportModeFromCabinetName("PCS20260528-SEA01") === "2", "PCS…SEA = sea");

// ROAD — GZE prefix + EK token (the correction: EK = road, NOT air)
ok(transportModeFromCabinetName("GZE2604-01") === "1", "GZE = road");
ok(transportModeFromCabinetName("CBX260616-EK08") === "1", "CBX…EK = road");
ok(transportModeFromCabinetName("EK260601-3") === "1", "EK = road");

// AIR — GZA prefix + AIR token
ok(transportModeFromCabinetName("GZA260601-1") === "3", "GZA = air");
ok(transportModeFromCabinetName("CBX260616-AIR02") === "3", "CBX…AIR = air");

// YW — อี้อู/Yiwu (TTW route · owner 2026-07-18): YWS=เรือ · YWE=รถ · YWA=แอร์
ok(transportModeFromCabinetName("YWS260717-8T") === "2", "YWS = sea");
ok(transportModeFromCabinetName("YWE260801-2T") === "1", "YWE = road");
ok(transportModeFromCabinetName("YWA260801-1T") === "3", "YWA = air");
// early TTW containers kept GZ prefixes + a "-NT" TTW suffix → GZS still decodes sea
ok(transportModeFromCabinetName("GZS260614-1T") === "2", "GZS…-1T (early TTW) = sea");

// No token → null
ok(transportModeFromCabinetName("") === null, "empty = null");
ok(transportModeFromCabinetName(null) === null, "null = null");
ok(transportModeFromCabinetName("F260418-12") === null, "no mode token = null");

// resolveTransportMode — name wins, else stored, else road
ok(resolveTransportMode("GZS260529-1", "1") === "2", "name (sea) overrides stored (road)");
ok(resolveTransportMode("GZE2604-01", "2") === "1", "name (road) overrides stored (sea)");
ok(resolveTransportMode("F260418-12", "2") === "2", "no name token → stored (sea)");
ok(resolveTransportMode("F260418-12", "3") === "3", "no name token → stored (air)");
ok(resolveTransportMode(null, null) === "1", "nothing → road default");

console.log(`cabinet-transport.test.ts — ${passed} passed · 0 failed`);
