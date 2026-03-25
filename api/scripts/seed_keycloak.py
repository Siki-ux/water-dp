import logging
import os
import time

import requests

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("water-dp-seed")

# ---------------------------------------------------------------------------
# Seed data — users and groups created during water-dp-seed run
#
#  User        | Password | UFZ-TSM:CzechHydro    | UFZ-TSM:ExternalSources
#  ------------|----------|-----------------------|------------------------
#  alice       | alice    | admin (owner)         | —
#  bob         | bob      | admin (owner)         | editor
#  carol       | carol    | editor                | viewer
#  dave        | dave     | viewer                | editor
#  eva         | eva      | —                     | admin (owner)
#  frank       | frank    | viewer                | viewer
#  grace       | grace    | editor                | —
#
#  admin-siki: realm admin — owner everywhere, NOT in any group
# ---------------------------------------------------------------------------

SEED_USERS = [
    # (username, password, first_name, last_name)
    ("alice", "alice", "Alice",  "Novak"),
    ("bob",   "bob",   "Bob",    "Dvorak"),
    ("carol", "carol", "Carol",  "Kral"),
    ("dave",  "dave",  "Dave",   "Horak"),
    ("eva",   "eva",   "Eva",    "Blaha"),
    ("frank", "frank", "Frank",  "Cerny"),
    ("grace", "grace", "Grace",  "Malik"),
]

SEED_GROUPS = [
    (
        "UFZ-TSM:CzechHydro",
        {
            "admins":  ["alice", "bob"],
            "editors": ["carol", "grace"],
            "viewers": ["dave", "frank"],
        },
    ),
    (
        "UFZ-TSM:ExternalSources",
        {
            "admins":  ["eva"],
            "editors": ["bob", "dave"],
            "viewers": ["carol", "frank"],
        },
    ),
]


def seed_keycloak_users_and_groups():
    """
    Create test users and Keycloak groups for the seed dataset.
    Idempotent — safe to run multiple times.
    """
    kc_url = os.getenv("KEYCLOAK_URL", "http://keycloak:8081/keycloak").rstrip("/")
    kc_admin = os.getenv("KEYCLOAK_ADMIN_USERNAME", "keycloak")
    kc_pass = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "keycloak")
    realm = "timeio"
    client_name = "timeIO-client"

    logger.info("=" * 60)
    logger.info("Seeding Keycloak users and groups...")
    logger.info("=" * 60)

    # Wait for Keycloak to be ready (setup_keycloak.py may still be running on first boot)
    token = None
    for attempt in range(30):
        try:
            resp = requests.post(
                f"{kc_url}/realms/master/protocol/openid-connect/token",
                data={"grant_type": "password", "client_id": "admin-cli",
                      "username": kc_admin, "password": kc_pass},
                timeout=5,
            )
            if resp.status_code == 200:
                token = resp.json()["access_token"]
                break
            logger.info(f"Keycloak not ready yet (attempt {attempt+1}/30, status {resp.status_code}), retrying in 5s...")
        except Exception as e:
            logger.info(f"Keycloak not reachable yet (attempt {attempt+1}/30): {e}, retrying in 5s...")
        time.sleep(5)

    if not token:
        logger.error("Keycloak admin auth failed after 30 attempts. Skipping Keycloak seed.")
        return

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Helper: find user by username
    def _find_user(username):
        r = requests.get(f"{kc_url}/admin/realms/{realm}/users",
                         headers=headers, params={"username": username, "exact": True})
        users = r.json() if r.ok else []
        return users[0] if users else None

    # Helper: get client UUID
    def _client_uuid():
        r = requests.get(f"{kc_url}/admin/realms/{realm}/clients",
                         headers=headers, params={"clientId": client_name})
        clients = r.json() if r.ok else []
        return clients[0]["id"] if clients else None

    # Helper: find top-level group by exact name
    def _find_group(name):
        r = requests.get(f"{kc_url}/admin/realms/{realm}/groups",
                         headers=headers, params={"search": name})
        for g in (r.json() if r.ok else []):
            if g["name"] == name:
                return g
        return None

    # Helper: find or create subgroup; returns subgroup ID
    def _ensure_subgroup(parent_id, name):
        r = requests.post(
            f"{kc_url}/admin/realms/{realm}/groups/{parent_id}/children",
            headers=headers, json={"name": name},
        )
        # Extract ID from Location header (201) or fall back to children list
        if r.status_code == 201:
            loc = r.headers.get("Location", "")
            if loc:
                sg_id = loc.rstrip("/").split("/")[-1]
                if sg_id:
                    return sg_id
        # Fallback: list children
        cr = requests.get(f"{kc_url}/admin/realms/{realm}/groups/{parent_id}/children",
                          headers=headers)
        for c in (cr.json() if cr.ok else []):
            if c["name"] == name:
                return c["id"]
        return None

    # 1. Create users
    for username, password, first_name, last_name in SEED_USERS:
        existing = _find_user(username)
        if existing:
            logger.info(f"User '{username}' already exists.")
        else:
            r = requests.post(
                f"{kc_url}/admin/realms/{realm}/users",
                headers=headers,
                json={
                    "username": username, "email": f"{username}@example.com",
                    "enabled": True, "emailVerified": True,
                    "firstName": first_name, "lastName": last_name,
                    "requiredActions": [],
                    "credentials": [{"type": "password", "value": password, "temporary": False}],
                },
            )
            if r.status_code == 201:
                logger.info(f"Created user '{username}'.")
            else:
                logger.warning(f"Could not create user '{username}': {r.text}")

    # 2. Ensure client roles exist (viewer/editor/admin)
    cu = _client_uuid()
    if cu:
        for role in ("viewer", "editor", "admin"):
            r = requests.post(f"{kc_url}/admin/realms/{realm}/clients/{cu}/roles",
                              headers=headers, json={"name": role})
            if r.status_code not in (201, 409):
                logger.warning(f"Could not ensure client role '{role}': {r.text}")

    SUBGROUP_ROLES = {"viewers": "viewer", "editors": "editor", "admins": "admin"}

    # 3. Create groups + subgroups + assign roles + add users
    for group_name, subgroup_members in SEED_GROUPS:
        # Create or find parent group
        existing_group = _find_group(group_name)
        if existing_group:
            group_id = existing_group["id"]
            logger.info(f"Group '{group_name}' already exists.")
        else:
            r = requests.post(f"{kc_url}/admin/realms/{realm}/groups",
                              headers=headers, json={"name": group_name})
            if r.status_code == 201:
                logger.info(f"Created group '{group_name}'.")
                group_id = _find_group(group_name)["id"]
            else:
                logger.error(f"Failed to create group '{group_name}': {r.text}")
                continue

        for sg_name, role_name in SUBGROUP_ROLES.items():
            sg_id = _ensure_subgroup(group_id, sg_name)
            if not sg_id:
                logger.error(f"Could not ensure subgroup '{sg_name}' under '{group_name}'")
                continue

            # Assign client role to subgroup
            if cu:
                role_r = requests.get(
                    f"{kc_url}/admin/realms/{realm}/clients/{cu}/roles/{role_name}",
                    headers=headers)
                if role_r.ok:
                    requests.post(
                        f"{kc_url}/admin/realms/{realm}/groups/{sg_id}/role-mappings/clients/{cu}",
                        headers=headers, json=[role_r.json()])

            # Add users to subgroup
            for username in subgroup_members.get(sg_name, []):
                user = _find_user(username)
                if user:
                    r = requests.put(
                        f"{kc_url}/admin/realms/{realm}/users/{user['id']}/groups/{sg_id}",
                        headers=headers)
                    if r.status_code == 204:
                        logger.info(f"  Added '{username}' to {group_name}/{sg_name}")
                    else:
                        logger.warning(f"  Could not add '{username}' to {group_name}/{sg_name}: {r.text}")

    logger.info("Keycloak user/group seeding complete.")
    logger.info("  Users (password = username): alice, bob, carol, dave, eva, frank, grace")
    logger.info("  Groups: UFZ-TSM:CzechHydro, UFZ-TSM:ExternalSources")


if __name__ == "__main__":
    seed_keycloak_users_and_groups()
