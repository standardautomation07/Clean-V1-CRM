import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";
const { isDirectoryUrl } = await import("./hunter");

test("directory and marketplace listings are not prospects", () => {
  for (const url of [
    "https://www.tradeindia.com/surat/motorized-rolling-shutter-city-220891.html",
    "https://www.indiamart.com/proddetail/rolling-shutter-motor-123.html",
    "https://m.indiamart.com/anything",
    "https://www.justdial.com/Surat/Rolling-Shutter-Dealers",
    "https://exportersindia.com/x",
    "https://www.linkedin.com/company/example",
    "https://en.wikipedia.org/wiki/Rolling_shutter",
  ]) {
    assert.equal(isDirectoryUrl(url), true, `should be filtered: ${url}`);
  }
});

test("real company sites are kept", () => {
  for (const url of [
    "https://newazadrollingshutters.com",
    "https://www.khodiyarrollingshutter.in",
    "https://www.gayatrishutters.com/rolling-shutters.html",
    "https://doorsandgatesindia.com/gear-rolling-shutter-motors.html",
    "https://www.smarttec.in/galvalume-rolling-shutter.html",
  ]) {
    assert.equal(isDirectoryUrl(url), false, `should be kept: ${url}`);
  }
});

test("a lookalike domain is not treated as a directory", () => {
  assert.equal(isDirectoryUrl("https://notindiamart.com/x"), false);
  assert.equal(isDirectoryUrl("https://indiamart.com.example.in/x"), false);
});

test("unparseable input is harmless", () => {
  assert.equal(isDirectoryUrl(""), false);
  assert.equal(isDirectoryUrl("not a url"), false);
});
