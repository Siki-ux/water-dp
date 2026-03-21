import os
import sys

import requests
from keycloak import KeycloakAdmin, KeycloakError

# Configuration
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "http://localhost:8081/keycloak").rstrip("/")
ADMIN_USER = os.getenv("KEYCLOAK_ADMIN_USERNAME", "keycloak")
ADMIN_PASSWORD = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "keycloak")
KEYCLOAK_REALM = "timeio"
CLIENT_ID_NAME = "timeIO-client"


def get_admin_token():
    """Authenticate as admin to get an access token."""
    url = f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"
    payload = {
        "grant_type": "password",
        "client_id": "admin-cli",
        "username": ADMIN_USER,
        "password": ADMIN_PASSWORD,
    }
    try:
        response = requests.post(url, data=payload)
        response.raise_for_status()
        return response.json()["access_token"]
    except Exception as e:
        print(f"Error getting admin token: {e}")
        print(f"Response: {response.text if 'response' in locals() else 'No response'}")
        sys.exit(1)


def get_client_id(token, client_name):
    """Get the internal UUID of the client by its clientId name."""
    url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/clients"
    headers = {"Authorization": f"Bearer {token}"}
    params = {"clientId": client_name}

    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    clients = response.json()

    if not clients:
        print(f"Client '{client_name}' not found.")
        return None

    return clients[0]["id"]


# ----------------------------------------------------------------------
# Helper Functions
# ----------------------------------------------------------------------


def find_user(token, realm, username):
    url = f"{KEYCLOAK_URL}/admin/realms/{realm}/users"
    headers = {"Authorization": f"Bearer {token}"}
    params = {"username": username, "exact": True}
    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    users = response.json()
    if users:
        return users[0]
    return None


def find_group(token, realm, name):
    url = f"{KEYCLOAK_URL}/admin/realms/{realm}/groups"
    headers = {"Authorization": f"Bearer {token}"}
    params = {"search": name}  # Fuzzy search
    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    groups = response.json()
    # Filter for exact match
    for g in groups:
        if g["name"] == name:
            return g
    return None


def create_group(token, realm, name):
    """Create a top-level group. Returns group ID."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"name": name}
    url = f"{KEYCLOAK_URL}/admin/realms/{realm}/groups"

    response = requests.post(url, headers=headers, json=payload)

    if response.status_code == 201:
        print(f"Created group '{name}'")
        return find_group(token, realm, name)["id"]
    elif response.status_code == 409:
        print(f"Group '{name}' already exists.")
        return find_group(token, realm, name)["id"]
    else:
        print(f"Failed to create group '{name}': {response.text}")
        return None


def set_group_attributes(token, realm, group_id, attributes):
    """Set/update attributes on a Keycloak group."""
    url = f"{KEYCLOAK_URL}/admin/realms/{realm}/groups/{group_id}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Get current group to preserve existing data
    group = requests.get(url, headers=headers).json()
    existing_attrs = group.get("attributes", {})

    # Keycloak stores attributes as lists of strings
    for k, v in attributes.items():
        existing_attrs[k] = [str(v)] if not isinstance(v, list) else v

    response = requests.put(url, headers=headers, json={"attributes": existing_attrs})
    if response.status_code == 204:
        print(f"Set attributes on group {group_id}: {list(attributes.keys())}")
    else:
        print(f"Failed to set group attributes: {response.status_code} {response.text}")


def ensure_client_role(token, realm, client_name, role_name):
    """Create a client role if it doesn't exist."""
    client_uuid = get_client_id(token, client_name)
    if not client_uuid:
        print(f"Cannot create role: client '{client_name}' not found")
        return

    url = f"{KEYCLOAK_URL}/admin/realms/{realm}/clients/{client_uuid}/roles"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(url, headers=headers, json={"name": role_name})

    if resp.status_code == 201:
        print(f"Created client role '{role_name}' on '{client_name}'")
    elif resp.status_code == 409:
        print(f"Client role '{role_name}' already exists on '{client_name}'")
    else:
        print(f"Failed to create client role: {resp.status_code} {resp.text}")


def assign_client_role_to_group(token, realm, group_id, client_name, role_name):
    """Assign a client role to a group (all members inherit it)."""
    client_uuid = get_client_id(token, client_name)
    if not client_uuid:
        return

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Get role representation
    role_url = f"{KEYCLOAK_URL}/admin/realms/{realm}/clients/{client_uuid}/roles/{role_name}"
    role_resp = requests.get(role_url, headers=headers)
    if role_resp.status_code != 200:
        print(f"Role '{role_name}' not found on client '{client_name}'")
        return
    role_rep = role_resp.json()

    # Assign to group
    assign_url = f"{KEYCLOAK_URL}/admin/realms/{realm}/groups/{group_id}/role-mappings/clients/{client_uuid}"
    resp = requests.post(assign_url, headers=headers, json=[role_rep])
    if resp.status_code == 204:
        print(f"Assigned client role '{role_name}' to group {group_id}")
    else:
        print(f"Failed to assign role to group: {resp.status_code} {resp.text}")


def join_group(token, realm, user_id, group_id):
    url = f"{KEYCLOAK_URL}/admin/realms/{realm}/users/{user_id}/groups/{group_id}"
    headers = {"Authorization": f"Bearer {token}"}
    requests.put(url, headers=headers)
    print(f"Added user {user_id} to group {group_id}")


def delete_user(token, realm, user_id):
    url = f"{KEYCLOAK_URL}/admin/realms/{realm}/users/{user_id}"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        response = requests.delete(url, headers=headers)
        response.raise_for_status()
        print(f"Deleted user {user_id} from {realm}")
    except Exception as e:
        print(f"Error deleting user: {e}")


def set_user_password(token, realm, user_id, password):
    url = f"{KEYCLOAK_URL}/admin/realms/{realm}/users/{user_id}/reset-password"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"value": password, "type": "password", "temporary": False}
    response = requests.put(url, headers=headers, json=payload)
    if response.status_code == 204:
        print(f"Successfully set password for user {user_id}")
    else:
        print(f"Failed to set password: {response.text}")


def create_user(token, realm, username, password):
    url = f"{KEYCLOAK_URL}/admin/realms/{realm}/users"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "username": username,
        "email": f"{username}@example.com",
        "enabled": True,
        "firstName": "Admin",
        "lastName": "Siki",
        "credentials": [{"value": password, "type": "password", "temporary": False}],
    }
    response = requests.post(url, headers=headers, json=payload)
    if response.status_code == 201:
        print(f"Created user {username} in {realm}")
        user = find_user(token, realm, username)
        return user["id"]
    elif response.status_code == 409:
        print(
            f"User {username} already exists in {realm}. Ensuring password is up to date..."
        )
        user = find_user(token, realm, username)
        set_user_password(token, realm, user["id"], password)
        return user["id"]
    else:
        print(f"Failed to create user: {response.text}")
        response.raise_for_status()


def assign_role(token, realm, user_id, role_name):
    # 1. Get Role
    url = f"{KEYCLOAK_URL}/admin/realms/{realm}/roles/{role_name}"
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(url, headers=headers)
    if response.status_code == 404:
        print(f"Role {role_name} not found in {realm}. Creating...")
        create_url = f"{KEYCLOAK_URL}/admin/realms/{realm}/roles"
        requests.post(create_url, headers=headers, json={"name": role_name})
        response = requests.get(url, headers=headers)

    response.raise_for_status()
    role_rep = response.json()

    # 2. Assign
    assign_url = (
        f"{KEYCLOAK_URL}/admin/realms/{realm}/users/{user_id}/role-mappings/realm"
    )
    requests.post(assign_url, headers=headers, json=[role_rep])
    print(f"Assigned realm role {role_name} to user")


def enable_direct_access_grants(token, client_uuid):
    """Update the client to enable direct access grants."""
    url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/clients/{client_uuid}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    payload = {"directAccessGrantsEnabled": True}

    response = requests.put(url, headers=headers, json=payload)
    if response.status_code == 204:
        print(f"Successfully enabled Direct Access Grants for client {CLIENT_ID_NAME}")
    else:
        print(f"Failed to update client. Status: {response.status_code}")
        print(response.text)


if __name__ == "__main__":
    print(f"Connecting to Keycloak at {KEYCLOAK_URL}...")

    # Initialize KeycloakAdmin
    server_url_for_admin = (
        KEYCLOAK_URL + "/" if not KEYCLOAK_URL.endswith("/") else KEYCLOAK_URL
    )
    keycloak_admin = KeycloakAdmin(
        server_url=server_url_for_admin,
        username=ADMIN_USER,
        password=ADMIN_PASSWORD,
        realm_name="master",
        verify=True,
    )

    print("KeycloakAdmin initialized.")
    keycloak_admin.realm_name = KEYCLOAK_REALM
    print(f"Switched KeycloakAdmin context to realm: {keycloak_admin.realm_name}")

    # ----------------------------------------------------------------------
    # 1. Update SSL Requirement for Master and TimeIO Realms
    # ----------------------------------------------------------------------
    print("Updating 'master' realm sslRequired to 'NONE'...")
    try:
        keycloak_admin.update_realm("master", {"sslRequired": "NONE"})
        print("Successfully updated 'master' realm SSL settings.")
    except Exception as e:
        print(f"Warning: Could not update 'master' realm SSL settings: {e}")

    print(f"Updating '{KEYCLOAK_REALM}' realm sslRequired to 'NONE'...")
    try:
        keycloak_admin.update_realm(KEYCLOAK_REALM, {"sslRequired": "NONE"})
        print(f"Successfully updated '{KEYCLOAK_REALM}' realm SSL settings.")
    except Exception as e:
        print(f"Warning: Could not update '{KEYCLOAK_REALM}' realm SSL settings: {e}")

    # ----------------------------------------------------------------------
    # 2. Create the Realm (if not exists)
    # ----------------------------------------------------------------------
    try:
        keycloak_admin.create_realm(payload={"realm": KEYCLOAK_REALM, "enabled": True})
        print(f"Realm '{KEYCLOAK_REALM}' created successfully.")
    except KeycloakError as e:
        if e.response_code == 409:
            print(f"Realm '{KEYCLOAK_REALM}' already exists.")
        else:
            print(f"Failed to create realm '{KEYCLOAK_REALM}': {e}")

    # ----------------------------------------------------------------------
    # 3. Create 'admin-siki' User with Full Privileges
    # ----------------------------------------------------------------------
    print("Obtaining new admin token for user operations...")
    token = get_admin_token()

    admin_user = os.getenv("SEED_ADMIN_USERNAME", "admin-siki")
    admin_pass = os.getenv("SEED_ADMIN_PASSWORD", "admin-siki")

    print(f"Checking '{KEYCLOAK_REALM}' realm for user creation...")
    try:
        user_id = create_user(token, KEYCLOAK_REALM, admin_user, admin_pass)

        if user_id:
            # Realm Role 'admin' - for general admin privileges within the realm
            assign_role(token, KEYCLOAK_REALM, user_id, "admin")
    except Exception as e:
        print(f"Error creating/configuring user: {e}")

    # ----------------------------------------------------------------------
    # 4. Setup 'timeIO-client' Client
    # ----------------------------------------------------------------------
    client_id = "timeIO-client"
    print(f"Checking/Creating client '{client_id}'...")

    token = get_admin_token()

    client_uuid = get_client_id(token, CLIENT_ID_NAME)
    if client_uuid:
        print(f"Found client UUID: {client_uuid}")
        enable_direct_access_grants(token, client_uuid)
    else:
        print("Could not find client to update.")

    # ----------------------------------------------------------------------
    # 5. Ensure 'admin' client role exists on timeIO-client
    # ----------------------------------------------------------------------
    print("Ensuring 'admin' client role exists on timeIO-client...")
    ensure_client_role(token, KEYCLOAK_REALM, CLIENT_ID_NAME, "admin")

    # ----------------------------------------------------------------------
    # 5.5 Ensure 'groups' protocol mapper on timeIO-client
    #     Without this, JWT tokens won't contain the user's group membership.
    # ----------------------------------------------------------------------
    if client_uuid:
        print("Ensuring 'groups' protocol mapper on timeIO-client...")
        mapper_name = "group-membership-mapper"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # Check if mapper already exists
        mappers_url = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/clients/{client_uuid}/protocol-mappers/models"
        existing_mappers = requests.get(mappers_url, headers=headers).json()
        mapper_exists = any(m.get("name") == mapper_name for m in existing_mappers)

        if not mapper_exists:
            mapper_payload = {
                "name": mapper_name,
                "protocol": "openid-connect",
                "protocolMapper": "oidc-group-membership-mapper",
                "config": {
                    "claim.name": "groups",
                    "full.path": "true",
                    "id.token.claim": "true",
                    "access.token.claim": "true",
                    "userinfo.token.claim": "true",
                },
            }
            resp = requests.post(mappers_url, headers=headers, json=mapper_payload)
            if resp.status_code == 201:
                print(f"Created 'groups' protocol mapper on timeIO-client")
            else:
                print(f"Failed to create groups mapper: {resp.status_code} {resp.text}")
        else:
            print("Groups protocol mapper already exists on timeIO-client.")

    # ----------------------------------------------------------------------
    # 6. Create Additional Users
    # ----------------------------------------------------------------------
    additional_users = ["SikiViewer", "SikiEditor", "Siki3"]
    user_ids_map = {}
    print("Creating additional users...")
    for u in additional_users:
        try:
            uid = create_user(token, KEYCLOAK_REALM, u, u)  # password = username
            if uid:
                user_ids_map[u] = uid
        except Exception as e:
            print(f"Error creating user {u}: {e}")

    # ----------------------------------------------------------------------
    # 7. Seed Project Groups (NO subgroups - Keycloak-centric model)
    #    Groups have attributes for schema_name linking.
    #    Client roles (admin) assigned to groups for authorization.
    # ----------------------------------------------------------------------
    print(f"Seeding groups in '{KEYCLOAK_REALM}' (Keycloak-centric model)...")

    projects_to_seed = ["UFZ-TSM:MyProject", "UFZ-TSM:MyProject2"]

    try:
        for project_group_name in projects_to_seed:
            # Create main group (no subgroups!)
            main_group_id = create_group(token, KEYCLOAK_REALM, project_group_name)

            if main_group_id:
                # Set group attributes for schema linking
                # schema_name will be populated when config_db project exists
                set_group_attributes(token, KEYCLOAK_REALM, main_group_id, {
                    "schema_name": "",  # populated later by project creation or backfill
                })

                # Assign 'admin' client role to the group
                # All members of this group will inherit the 'admin' role on timeIO-client
                assign_client_role_to_group(
                    token, KEYCLOAK_REALM, main_group_id, CLIENT_ID_NAME, "admin"
                )

                # Add admin-siki to every project group
                if user_id:
                    join_group(token, KEYCLOAK_REALM, user_id, main_group_id)

                # Project-specific user assignments (just group membership, no subgroups)
                if project_group_name == "UFZ-TSM:MyProject":
                    if "SikiViewer" in user_ids_map:
                        join_group(
                            token, KEYCLOAK_REALM,
                            user_ids_map["SikiViewer"], main_group_id,
                        )
                    if "SikiEditor" in user_ids_map:
                        join_group(
                            token, KEYCLOAK_REALM,
                            user_ids_map["SikiEditor"], main_group_id,
                        )

                elif project_group_name == "UFZ-TSM:MyProject2":
                    if "Siki3" in user_ids_map:
                        join_group(
                            token, KEYCLOAK_REALM,
                            user_ids_map["Siki3"], main_group_id,
                        )

    except Exception as e:
        print(f"Error seeding groups: {e}")

    print("Keycloak setup complete (Keycloak-centric model).")
