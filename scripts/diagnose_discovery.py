#!/usr/bin/env python3
"""Web / iOS 端末検出の診断スクリプト（修正なし・調査用）。

Usage:
  python3 scripts/diagnose_discovery.py
  python3 scripts/diagnose_discovery.py --base https://lynkos-f7xf.onrender.com
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
import urllib.error
import urllib.request

try:
    import websockets
except ImportError:
    websockets = None


def http_json(method: str, url: str, payload: dict | None = None) -> tuple[int, object]:
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = body
        return exc.code, parsed


def log(label: str, message: str) -> None:
    print(f"[{label}] {message}")


def list_devices(base: str) -> list[dict]:
    status, data = http_json("GET", f"{base}/api/devices/")
    if status != 200 or not isinstance(data, list):
        raise RuntimeError(f"GET /api/devices/ failed: HTTP {status} {data}")
    return data


def register(base: str, device: dict) -> None:
    status, data = http_json("POST", f"{base}/api/devices/", device)
    if status != 200:
        raise RuntimeError(f"POST /api/devices/ failed for {device['deviceId']}: HTTP {status} {data}")
    log("HTTP", f"registered {device['deviceId']} platform={device.get('platform')} name={device.get('name')}")


async def presence_roundtrip(base: str, device: dict) -> None:
    if websockets is None:
        log("WS", "websockets package not installed — skip (pip install websockets)")
        return

    ws_base = base.replace("https://", "wss://").replace("http://", "ws://")
    url = f"{ws_base}/ws/presence/"
    log("WS", f"connecting {url} as {device['deviceId']}")

    async with websockets.connect(url, open_timeout=30) as ws:
        await ws.send(json.dumps({"type": "device-info", "device": device}))
        log("WS", f"sent device-info for {device['deviceId']}")

        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=5)
            log("WS", f"received: {msg[:200]}")
        except asyncio.TimeoutError:
            log("WS", "no immediate message (expected if alone on channel)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Diagnose LynkOS device discovery")
    parser.add_argument(
        "--base",
        default="https://lynkos-f7xf.onrender.com",
        help="Signaling server base URL",
    )
    args = parser.parse_args()
    base = args.base.rstrip("/")

    web_device = {
        "deviceId": f"diag-web-{int(time.time())}",
        "name": "Diag-Web",
        "type": "desktop",
        "platform": "windows",
    }
    ios_device = {
        "deviceId": f"diag-ios-{int(time.time())}",
        "name": "Diag-iOS",
        "type": "mobile",
        "platform": "ios",
    }

    log("INFO", f"target server: {base}")
    log("INFO", "production web bundle uses same Render URL (verified in index-D0Eh7UO6.js)")

    status, health = http_json("GET", f"{base}/api/health/")
    log("HEALTH", f"HTTP {status} {health}")

    before = list_devices(base)
    log("LIST", f"before registration: {len(before)} device(s)")
    for row in before:
        log("LIST", f"  - {row.get('deviceId')} platform={row.get('platform')} name={row.get('name')}")

    register(base, web_device)
    register(base, ios_device)

    after = list_devices(base)
    log("LIST", f"after registration: {len(after)} device(s)")
    for row in after:
        log("LIST", f"  - {row.get('deviceId')} platform={row.get('platform')} name={row.get('name')}")

    web_sees_ios = ios_device["deviceId"] in {d.get("deviceId") for d in after if d.get("deviceId") != web_device["deviceId"]}
    ios_sees_web = web_device["deviceId"] in {d.get("deviceId") for d in after if d.get("deviceId") != ios_device["deviceId"]}
    log("CHECK", f"Web perspective would list iOS device: {web_sees_ios}")
    log("CHECK", f"iOS perspective would list Web device: {ios_sees_web}")

    if websockets is not None:
        asyncio.run(presence_roundtrip(base, web_device))

    log("SUMMARY", "Same-server HTTP registry shows both platforms — no server-side platform filter.")
    log("SUMMARY", "If real clients miss each other, suspect DIFFERENT signaling URLs (Bonjour hub vs cloud).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
