"""
BlueBeatle Bulk Sensor Creation Script
=======================================
Fetches all monitoring places from the BlueBeatle API (/place/all) and creates
one sensor per place in the water-dp platform, pre-filled with name and coordinates.

Auth uses OAuth2 Client Credentials (Keycloak at auth.kdejemoje.cz).
Each sensor is configured with ext_api type 'bluebeatle', storing the place_id
and encrypted OAuth2 credentials. Sync uses GET /place/{id}/data/v3 per sensor
— no cross-device data fetching.

Usage:
    python bluebeatle_bulk_create.py \
        --api-url https://your-domain.com/water-api/api/v1 \
        --token YOUR_BEARER_TOKEN \
        --group-id YOUR_KEYCLOAK_GROUP_UUID \
        --project-uuid YOUR_PROJECT_UUID  \
        --bb-client-id czu \
        --bb-client-secret dDQTbf8BBA6iSSEgMLPWuNK59cCnsOuU \
        --sync-interval 60 \
        --dry-run

Prerequisites:
    pip install requests
    The 'bluebeatle' API type must be registered in water-dp:
        POST /api/v1/external-sources/api-types?name=bluebeatle
    BlueBeatleApiSyncer must be present in tsm-orchestration's ext_api.py.
"""

import argparse
import json
import sys

import requests

BB_TOKEN_URL = "https://auth.kdejemoje.cz/realms/bb-portal/protocol/openid-connect/token"
BB_PLACES_URL = "https://api.data.bluebeatle.cz/place/all"


def get_bb_token(client_id: str, client_secret: str) -> str:
    resp = requests.post(
        BB_TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def fetch_places(client_id: str, client_secret: str) -> list[dict]:
    """Fetch all BlueBeatle places with id, name, lat, lng."""
    token = get_bb_token(client_id, client_secret)
    resp = requests.get(
        BB_PLACES_URL,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


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
    place: dict,
    group_id: str,
    project_uuid: str | None,
    bb_client_id: str,
    bb_client_secret: str,
    sync_interval: int,
) -> dict:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload: dict = {
        "sensor_name": place["name"],
        "description": f"BlueBeatle place ID {place['id']}",
        "device_type": "bluebeatle",
        "ingest_type": "extapi",
        "latitude": place.get("lat"),
        "longitude": place.get("lng"),
        "external_api": {
            "type": "bluebeatle",
            "enabled": False,  # MQTT bridge handles ingestion; HTTP polling disabled
            "sync_interval": sync_interval,
            "settings": {
                "place_id": place["id"],
                "client_id": bb_client_id,
                "client_secret": bb_client_secret,  # encrypted at rest by the API
            },
        },
    }
    if project_uuid:
        payload["project_uuid"] = project_uuid
    else:
        payload["group_id"] = group_id

    resp = requests.post(f"{api_url}/things/", json=payload, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    parser = argparse.ArgumentParser(description="Bulk-create BlueBeatle sensors in water-dp")
    parser.add_argument("--api-url", required=True, help="water-dp API base URL (no trailing slash)")
    parser.add_argument("--token", required=True, help="Bearer token for water-dp API")
    parser.add_argument("--group-id", required=False, default="", help="Keycloak group UUID")
    parser.add_argument("--project-uuid", required=False, default=None, help="Project UUID to link sensors to")
    parser.add_argument("--bb-client-id", default="czu", help="BlueBeatle OAuth2 client ID")
    parser.add_argument("--bb-client-secret", required=True, help="BlueBeatle OAuth2 client secret")
    parser.add_argument("--sync-interval", type=int, default=60, help="Sync interval in minutes (default: 60)")
    parser.add_argument("--place-ids", nargs="*", type=int, default=None, help="Only create sensors for these place IDs (default: all)")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without creating sensors")
    args = parser.parse_args()

    if not args.group_id and not args.project_uuid:
        print("Error: provide --group-id or --project-uuid", file=sys.stderr)
        sys.exit(1)

    print("Fetching place list from BlueBeatle API...")
    try:
        places = fetch_places(args.bb_client_id, args.bb_client_secret)
    except requests.HTTPError as e:
        print(f"Failed to fetch places: {e}", file=sys.stderr)
        sys.exit(1)

    if args.place_ids:
        places = [p for p in places if p["id"] in args.place_ids]

    print(f"Found {len(places)} places.")

    if args.dry_run:
        print("\n[DRY RUN] Would create the following sensors:")
        for p in sorted(places, key=lambda x: x["id"]):
            print(f"  place_id={p['id']:>4}  name={p['name']:<30}  lat={p.get('lat')}  lng={p.get('lng')}")
        print(f"\nTotal: {len(places)} sensors. Run without --dry-run to create.")
        return

    print("\nRegistering API type...")
    register_api_type(args.api_url, args.token)

    created = []
    failed = []

    for i, place in enumerate(sorted(places, key=lambda x: x["id"]), 1):
        print(f"  [{i}/{len(places)}] place_id={place['id']} '{place['name']}'...", end=" ")
        try:
            result = create_sensor(
                api_url=args.api_url,
                token=args.token,
                place=place,
                group_id=args.group_id,
                project_uuid=args.project_uuid,
                bb_client_id=args.bb_client_id,
                bb_client_secret=args.bb_client_secret,
                sync_interval=args.sync_interval,
            )
            uuid = result.get("uuid") or result.get("thing_uuid") or "?"
            print(f"ok (uuid={uuid})")
            created.append({"place_id": place["id"], "name": place["name"], "uuid": uuid})
        except requests.HTTPError as e:
            detail = ""
            try:
                detail = e.response.json().get("detail", "")
            except Exception:
                pass
            print(f"FAILED ({e.response.status_code}: {detail})")
            failed.append({"place_id": place["id"], "name": place["name"], "error": str(e)})

    print(f"\nDone. Created: {len(created)}, Failed: {len(failed)}")
    if created:
        print("\nCreated sensors (save this for reference):")
        print(json.dumps(created, indent=2))
    if failed:
        print("\nFailed:")
        print(json.dumps(failed, indent=2))


if __name__ == "__main__":
    main()
