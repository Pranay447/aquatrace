import { test } from "node:test";
import assert from "node:assert/strict";
import { privateIpv4 } from "../scripts/prepare-local-device.mjs";
test("local ESP32 setup accepts private IPv4 addresses and rejects public/loopback/invalid addresses", () => {
  for (const ip of [
    "192.168.1.25",
    "192.168.150.3",
    "172.16.0.2",
    "172.31.255.2",
    "10.0.0.2",
  ])
    assert.equal(privateIpv4(ip), true, ip);
  for (const ip of [
    "127.0.0.1",
    "localhost",
    "8.8.8.8",
    "172.15.0.1",
    "172.32.0.1",
    "192.168.1.256",
    "192.168.1",
    "192.168.1.2/24",
    "192.168.1.2:3000",
  ])
    assert.equal(privateIpv4(ip), false, ip);
});
