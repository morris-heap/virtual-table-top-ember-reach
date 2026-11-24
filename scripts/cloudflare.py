
"""
Lightweight Cloudflare CLI for Codex.
Read-only. Compact JSON. No MCP required.

Usage:
    python scripts/cloudflare.py verify
    python scripts/cloudflare.py zones
    python scripts/cloudflare.py dns
    python scripts/cloudflare.py workers
    python scripts/cloudflare.py deployments WORKER_NAME
"""

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.parse import quote

import requests
from dotenv import load_dotenv

# Load credentials from project-root .env
ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

API = "https://api.cloudflare.com/client/v4"


def output(data):
    """Produce compact, token-efficient JSON."""
    print(json.dumps(data, separators=(",", ":")))


def required_env(name):
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing environment variable: {name}")
    return value


def api_get(path, params=None):
    """Make authenticated, read-only API requests."""
    token = required_env("CLOUDFLARE_API_TOKEN")

    response = requests.get(
        f"{API}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
        params=params,
        timeout=20,
    )

    # Do not expose request headers, tokens, or full
    # API responses in errors.
    if not response.ok:
        raise ValueError(f"Cloudflare HTTP {response.status_code}")

    data = response.json()

    if not data.get("success"):
        errors = [
            {"code": e.get("code"), "message": e.get("message")}
            for e in data.get("errors", [])
        ]
        raise ValueError(json.dumps(errors))

    return data


def verify():
    result = api_get("/user/tokens/verify")["result"]
    output({"status": result.get("status")})


def zones():
    data = api_get("/zones", {"per_page": 50})

    output({
        "zones": [
            {
                "id": z["id"],
                "name": z["name"],
                "status": z.get("status"),
            }
            for z in data["result"]
        ],
        "total": data.get("result_info", {}).get("total_count"),
    })


def dns():
    zone_id = required_env("CLOUDFLARE_ZONE_ID")

    data = api_get(
        f"/zones/{zone_id}/dns_records",
        {"per_page": 50},
    )

    output({
        "records": [
            {
                "type": r["type"],
                "name": r["name"],
                "content": r.get("content"),
                "proxied": r.get("proxied"),
            }
            for r in data["result"]
        ],
        "total": data.get("result_info", {}).get("total_count"),
    })


def workers():
    account_id = required_env("CLOUDFLARE_ACCOUNT_ID")

    data = api_get(
        f"/accounts/{account_id}/workers/scripts"
    )

    output({
        "workers": [
            {
                "name": w["id"],
                "modified": w.get("modified_on"),
            }
            for w in data["result"]
        ]
    })


def deployments(worker_name):
    account_id = required_env("CLOUDFLARE_ACCOUNT_ID")
    name = quote(worker_name, safe="")

    data = api_get(
        f"/accounts/{account_id}/workers/scripts/"
        f"{name}/deployments",
        {"per_page": 5},
    )

    records = data["result"].get("deployments", [])

    output({
        "worker": worker_name,
        "deployments": [
            {
                "id": d.get("id"),
                "created": d.get("created_on"),
                "source": d.get("source"),
                "versions": [
                    {
                        "id": v.get("version_id"),
                        "percentage": v.get("percentage"),
                    }
                    for v in d.get("versions", [])
                ],
            }
            for d in records[:5]
        ],
    })


def main():
    parser = argparse.ArgumentParser(
        description="Token-efficient Cloudflare CLI"
    )

    parser.add_argument(
        "command",
        choices=[
            "verify",
            "zones",
            "dns",
            "workers",
            "deployments",
        ],
    )
    parser.add_argument("worker_name", nargs="?")
    args = parser.parse_args()

    try:
        if args.command == "verify":
            verify()
        elif args.command == "zones":
            zones()
        elif args.command == "dns":
            dns()
        elif args.command == "workers":
            workers()
        elif args.command == "deployments":
            if not args.worker_name:
                parser.error(
                    "deployments requires WORKER_NAME"
                )
            deployments(args.worker_name)

    except (ValueError, requests.RequestException) as exc:
        output({"error": str(exc)})
        sys.exit(1)


if __name__ == "__main__":
    main()
