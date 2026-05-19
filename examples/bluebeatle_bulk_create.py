"""
BlueBeatle Bulk Sensor Creation Script
=======================================
Fetches the list of unique IMSI devices from the BlueBeatle API and creates
one sensor per device in the water-dp platform with the 'bluebeatle' ext_api type.

Usage:
    python bluebeatle_bulk_create.py \
        --api-url https://your-domain.com/water-api/api/v1 \
        --token YOUR_BEARER_TOKEN \
        --group-id YOUR_KEYCLOAK_GROUP_UUID \
        --project-uuid YOUR_PROJECT_UUID  # optional, to auto-link sensors to a project
        --bb-username czu \
        --bb-password ARQwAe8EBW3kJV3v \
        --dry-run  # print what would be created without actually creating

Prerequisites:
    pip install requests
    The 'bluebeatle' API type must be registered in water-dp:
        POST /api/v1/external-sources/api-types with name=bluebeatle
    The BlueBeatleApiSyncer class must be present in tsm-orchestration's ext_api.py
    (it is a built-in syncer, no upload required).
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone

import requests

BB_API_URL = "https://api.data.bluebeatle.cz/data/v3/all"

# Friendly names for known IMSI prefixes — purely cosmetic, edit freely
_KNOWN_PREFIXES: dict[str, str] = {}


def fetch_imsi_list(username: str, password: str) -> list[str]:
    """Fetch one day of data from BlueBeatle and return the unique IMSI list."""
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)
    params = {"from": str(yesterday), "to": str(today)}
    resp = requests.get(BB_API_URL, params=params, auth=(username, password), timeout=60)
    resp.raise_for_status()
    records = resp.json()
    seen: dict[str, None] = {}
    for r in records:
        imsi = str(r.get("Imsi", "")).strip()
        if imsi:
            seen[imsi] = None
    return list(seen.keys())


def register_api_type(api_url: str, token: str) -> None:
    """Ensure the 'bluebeatle' API type exists (idempotent)."""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{api_url}/external-sources/api-types/bluebeatle", headers=headers)
    if resp.status_code == 200:
        print("  [ok] API type 'bluebeatle' already registered.")
        return
    resp = requests.post(
        f"{api_url}/external-sources/api-types",
        params={"name": "bluebeatle"},
        headers=headers,
    )
    resp.raise_for_status()
    print("  [ok] Registered API type 'bluebeatle'.")


def create_sensor(
    api_url: str,
    token: str,
    imsi: str,
    group_id: str,
    project_uuid: str | None,
    bb_username: str,
    bb_password: str,
    sync_interval: int,
) -> dict:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    label = _KNOWN_PREFIXES.get(imsi[:6], f"BlueBeatle-{imsi[-6:]}")
    payload: dict = {
        "sensor_name": label,
        "description": f"BlueBeatle device IMSI {imsi}",
        "device_type": "bluebeatle",
        "ingest_type": "extapi",
        "external_api": {
            "type": "bluebeatle",
            "enabled": True,
            "sync_interval": sync_interval,
            "settings": {
                "imsi": imsi,
                "username": bb_username,
                "password": bb_password,
            },
        },
    }
    if project_uuid:
        payload["project_uuid"] = project_uuid
    else:
        payload["group_id"] = group_id

    resp = requests.post(f"{api_url}/things", json=payload, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    parser = argparse.ArgumentParser(description="Bulk-create BlueBeatle sensors in water-dp")
    parser.add_argument("--api-url", required=True, help="water-dp API base URL (no trailing slash)")
    parser.add_argument("--token", required=True, help="Bearer token for water-dp API")
    parser.add_argument("--group-id", required=False, default="", help="Keycloak group UUID")
    parser.add_argument("--project-uuid", required=False, default=None, help="Project UUID to link sensors to")
    parser.add_argument("--bb-username", default="czu", help="BlueBeatle API username")
    parser.add_argument("--bb-password", required=True, help="BlueBeatle API password (plaintext)")
    parser.add_argument("--sync-interval", type=int, default=60, help="Sync interval in minutes (default: 60)")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without creating sensors")
    args = parser.parse_args()

    if not args.group_id and not args.project_uuid:
        print("Error: provide --group-id or --project-uuid", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching IMSI list from BlueBeatle API...")
    try:
        imsi_list = fetch_imsi_list(args.bb_username, args.bb_password)
    except requests.HTTPError as e:
        print(f"Failed to fetch IMSI list: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(imsi_list)} unique devices.")

    if args.dry_run:
        print("\n[DRY RUN] Would create the following sensors:")
        for imsi in sorted(imsi_list):
            print(f"  IMSI {imsi} → name: BlueBeatle-{imsi[-6:]}")
        print(f"\nTotal: {len(imsi_list)} sensors. Run without --dry-run to create.")
        return

    print(f"\nRegistering API type...")
    register_api_type(args.api_url, args.token)

    created = []
    failed = []

    for i, imsi in enumerate(sorted(imsi_list), 1):
        print(f"  [{i}/{len(imsi_list)}] Creating sensor for IMSI {imsi}...", end=" ")
        try:
            result = create_sensor(
                api_url=args.api_url,
                token=args.token,
                imsi=imsi,
                group_id=args.group_id,
                project_uuid=args.project_uuid,
                bb_username=args.bb_username,
                bb_password=args.bb_password,
                sync_interval=args.sync_interval,
            )
            uuid = result.get("uuid") or result.get("thing_uuid") or "?"
            print(f"ok (uuid={uuid})")
            created.append({"imsi": imsi, "uuid": uuid})
        except requests.HTTPError as e:
            detail = ""
            try:
                detail = e.response.json().get("detail", "")
            except Exception:
                pass
            print(f"FAILED ({e.response.status_code}: {detail})")
            failed.append({"imsi": imsi, "error": str(e)})

    print(f"\nDone. Created: {len(created)}, Failed: {len(failed)}")
    if created:
        print("\nCreated sensors (save this for reference):")
        print(json.dumps(created, indent=2))
    if failed:
        print("\nFailed:")
        print(json.dumps(failed, indent=2))


if __name__ == "__main__":
    main()
