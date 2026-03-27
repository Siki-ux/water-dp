import logging
from typing import Optional

import requests
from keycloak import KeycloakAdmin

from app.core.config import settings
from app.core.exceptions import AuthenticationException, ConfigurationException

logger = logging.getLogger(__name__)


class KeycloakService:
    _admin_client: Optional[KeycloakAdmin] = None

    # ... (Keep existing get_admin_client and other admin methods) ...

    @staticmethod
    def _get_token_url() -> str:
        """Construct the Token Endpoint URL manually."""
        base = settings.keycloak_url.rstrip("/")
        realm = settings.keycloak_realm
        return f"{base}/realms/{realm}/protocol/openid-connect/token"

    @staticmethod
    def login_user(username: str, password: str) -> dict:
        """
        Login a user and return tokens (access, refresh).
        """
        try:
            url = KeycloakService._get_token_url()
            payload = {
                "client_id": settings.keycloak_client_id,
                "username": username,
                "password": password,
                "grant_type": "password",
            }
            # For public clients, no client_secret is needed.

            logger.info(
                f"POST {url} with client_id={settings.keycloak_client_id}, username={username}"
            )

            response = requests.post(url, data=payload, verify=True, timeout=10)

            if response.status_code == 200:
                return response.json()
            else:
                logger.warning(
                    f"Login failed. Status: {response.status_code}, Body: {response.text}"
                )
                raise AuthenticationException(message="Invalid credentials")

        except AuthenticationException:
            raise
        except Exception as e:
            logger.error(f"Login error: {e}")
            raise AuthenticationException(
                message="Login failed due to unexpected error"
            )

    @staticmethod
    def refresh_user_token(refresh_token: str) -> dict:
        """
        Refresh a user's access token using their refresh token.
        """
        try:
            url = KeycloakService._get_token_url()
            payload = {
                "client_id": settings.keycloak_client_id,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            }

            response = requests.post(url, data=payload, verify=True, timeout=10)

            if response.status_code == 200:
                return response.json()
            else:
                logger.warning(
                    f"Refresh failed. Status: {response.status_code}, Body: {response.text}"
                )
                raise AuthenticationException(
                    message="Invalid or expired refresh token"
                )

        except AuthenticationException:
            raise
        except Exception as e:
            logger.error(f"Refresh error: {e}")
            raise AuthenticationException(message="Token refresh failed")

    @classmethod
    def get_admin_client(cls) -> KeycloakAdmin:
        # ... (rest of file)
        """
        Get or initialize Keycloak Admin client.

        Note: requires KEYCLOAK_ADMIN_CLIENT_SECRET or username/password in settings.
        Also assumes 'admin-cli' client exists or similar.
        """
        if cls._admin_client:
            return cls._admin_client

        try:
            # Determine connection mode: Client Credentials or Password
            # Usually for backend tasks, client_credentials with a service account is best.
            # But 'admin-cli' public client often uses password.
            # We'll try dynamic approach based on config.

            # Note: For keycloak-admin library, you usually connect to Master realm to manage others,
            # OR connect directly to target realm if the client has realm-management roles there.

            # Assuming we use a client in the SAME realm or a dedicated service account

            server_url = settings.keycloak_url
            if not server_url.endswith("/"):
                server_url += "/"

            connection_args = {
                "server_url": server_url,
                "realm_name": settings.keycloak_realm,
                "client_id": settings.keycloak_admin_client_id,
                "verify": True,
            }

            if settings.keycloak_admin_client_secret:
                connection_args["client_secret_key"] = (
                    settings.keycloak_admin_client_secret
                )
                connection_args["user_realm_name"] = settings.keycloak_realm
                # For client_credentials, we usually don't set user_realm_name generally,
                # but python-keycloak might need it.
                # If using valid Service Account with realm-admin role:
                # authentication logic is handled by lib.
            elif settings.keycloak_admin_username and settings.keycloak_admin_password:
                connection_args["username"] = settings.keycloak_admin_username
                connection_args["password"] = settings.keycloak_admin_password
                connection_args["user_realm_name"] = (
                    "master"  # Admin users usually in master
                )
            else:
                # Fallback/Error
                logger.warning(
                    "No Keycloak Admin credentials found. User lookup will fail."
                )
                # Fallback/Error: do not proceed with incomplete authentication configuration
                error_msg = (
                    "No Keycloak Admin credentials configured. "
                    "Set KEYCLOAK_ADMIN_CLIENT_SECRET or "
                    "KEYCLOAK_ADMIN_USERNAME/KEYCLOAK_ADMIN_PASSWORD."
                )
                logger.error(error_msg)
                raise ConfigurationException(message=error_msg)

            cls._admin_client = KeycloakAdmin(**connection_args)
            return cls._admin_client

        except Exception as e:
            logger.error(f"Failed to initialize Keycloak Admin client: {e}")
            raise

    @classmethod
    def get_service_token(cls) -> Optional[str]:
        """
        Get the current valid access token for the admin/service account.
        """
        try:
            admin = cls.get_admin_client()
            # Ensure token is valid/refreshed
            if admin.token:
                # KeycloakAdmin usually handles refresh on calls, but we can access the token dict
                return admin.token.get("access_token")
            # If no token, maybe force refresh or re-auth?
            # Calling users_count() or similar updates the token if needed.
            admin.users_count()
            return admin.token.get("access_token")
        except Exception as e:
            logger.error(f"Error retrieving service token: {e}")
            return None

    @classmethod
    def get_user_by_username(cls, username: str) -> Optional[dict]:
        """
        Find user by username (exact match).
        Returns user dict (id, username, email, etc.) or None.
        """
        try:
            admin = cls.get_admin_client()
            # method: get_users(query={"username": ...})
            users = admin.get_users(query={"username": username, "exact": True})
            if users:
                return users[0]
            return None
        except Exception as e:
            logger.error(f"Error fetching user {username} from Keycloak: {e}")
            # Reset client on failure (token expiry etc)
            cls._admin_client = None
            return None

    @classmethod
    def create_user(cls, username: str, email: str, password: str, first_name: str = "", last_name: str = "") -> str:
        """Create a new Keycloak user and return their UUID."""
        from fastapi import HTTPException
        try:
            admin = cls.get_admin_client()
            user_id = admin.create_user({
                "username": username,
                "email": email,
                "firstName": first_name,
                "lastName": last_name,
                "enabled": True,
                "emailVerified": True,
            })
            # Explicitly set password — some python-keycloak versions ignore
            # the credentials field in the create payload.
            admin.set_user_password(user_id, password, temporary=False)
            return user_id
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error creating user '{username}': {error_msg}")
            cls._admin_client = None
            if "409" in error_msg or "Conflict" in error_msg or "already exists" in error_msg.lower():
                raise HTTPException(status_code=400, detail="Username or email already exists")
            raise HTTPException(status_code=500, detail="Failed to create user")

    @classmethod
    def update_profile(cls, user_id: str, first_name: Optional[str], last_name: Optional[str], email: Optional[str]):
        """Update a user's profile fields in Keycloak."""
        try:
            admin = cls.get_admin_client()
            payload = {}
            if first_name is not None:
                payload["firstName"] = first_name
            if last_name is not None:
                payload["lastName"] = last_name
            if email is not None:
                payload["email"] = email
            if payload:
                admin.update_user(user_id, payload)
        except Exception as e:
            logger.error(f"Error updating profile for user {user_id}: {e}")
            cls._admin_client = None
            raise

    @classmethod
    def set_user_password(cls, user_id: str, new_password: str):
        """Set a new password for a user (admin override, no current password required)."""
        try:
            admin = cls.get_admin_client()
            admin.set_user_password(user_id, new_password, temporary=False)
        except Exception as e:
            logger.error(f"Error setting password for user {user_id}: {e}")
            cls._admin_client = None
            raise

    @classmethod
    def get_user_by_email(cls, email: str) -> Optional[dict]:
        try:
            admin = cls.get_admin_client()
            users = admin.get_users(query={"email": email, "exact": True})
            if users:
                return users[0]
            return None
        except Exception as e:
            logger.error(f"Error fetching user email {email} from Keycloak: {e}")
            cls._admin_client = None
            return None

    @classmethod
    def get_user_by_id(cls, user_id: str) -> Optional[dict]:
        """Fetch user by UUID."""
        try:
            admin = cls.get_admin_client()
            return admin.get_user(user_id)
        except Exception as e:
            logger.error(f"Error fetching user ID {user_id} from Keycloak: {e}")
            cls._admin_client = None
            return None

    @classmethod
    def create_group(cls, group_name: str) -> Optional[str]:
        """Create a new group in Keycloak and return its ID."""
        try:
            admin = cls.get_admin_client()
            payload = {"name": group_name}
            # create_group returns the group ID
            group_id = admin.create_group(payload)
            return group_id
        except Exception as e:
            logger.error(f"Error creating group '{group_name}' in Keycloak: {e}")
            cls._admin_client = None
            return None

    @classmethod
    def get_group(cls, group_id: str) -> Optional[dict]:
        """Get group details by ID."""
        try:
            admin = cls.get_admin_client()
            return admin.get_group(group_id=group_id)
        except Exception as e:
            logger.error(f"Error fetching group {group_id}: {e}")
            cls._admin_client = None
            return None

    @classmethod
    def get_child_group(cls, parent_id: str, child_name: str) -> Optional[dict]:
        """Get a child group by name under a parent group."""
        try:
            admin = cls.get_admin_client()
            children = admin.get_group_children(group_id=parent_id)
            for c in children:
                if c.get("name") == child_name:
                    return c
            return None
        except Exception as e:
            logger.error(
                f"Error fetching child group '{child_name}' for {parent_id}: {e}"
            )
            cls._admin_client = None
            return None

    @classmethod
    def create_subgroup(cls, parent_id: str, name: str) -> Optional[str]:
        """Create a child group under parent_id and return the new group's ID."""
        try:
            admin = cls.get_admin_client()
            group_id = admin.create_group(payload={"name": name}, parent=parent_id)
            return group_id
        except Exception as e:
            logger.error(f"Error creating subgroup '{name}' under {parent_id}: {e}")
            cls._admin_client = None
            return None

    @classmethod
    def get_subgroups(cls, group_id: str) -> list:
        """Return all direct child groups of a group."""
        try:
            admin = cls.get_admin_client()
            return admin.get_group_children(group_id=group_id) or []
        except Exception as e:
            logger.error(f"Error fetching subgroups for {group_id}: {e}")
            cls._admin_client = None
            return []

    @classmethod
    def get_subgroup_by_name(cls, parent_id: str, name: str) -> Optional[dict]:
        """Get a specific child group by name (alias for get_child_group)."""
        return cls.get_child_group(parent_id, name)

    @classmethod
    def get_group_by_name(cls, group_name: str) -> Optional[dict]:
        """
        Find group by name (exact match).
        Note: specific handling for 'path' style names could be added here if needed.
        """
        try:
            admin = cls.get_admin_client()
            # 'search' param is a substring match
            groups = admin.get_groups(query={"search": group_name})
            for g in groups:
                if g.get("name") == group_name:
                    return g
                # Fallback: if name is a path, we might need traversal, but let's assume flat or exact name for now
            return None
        except Exception as e:
            logger.error(f"Error finding group by name '{group_name}': {e}")
            cls._admin_client = None
            return None

    @classmethod
    def get_group_members(cls, group_id: str) -> list:
        """Get members of a group."""
        try:
            admin = cls.get_admin_client()
            return admin.get_group_members(group_id=group_id)
        except Exception as e:
            logger.error(f"Error fetching members for group {group_id}: {e}")
            cls._admin_client = None
            return []

    @classmethod
    def add_user_to_group(cls, user_id: str, group_id: str):
        """Add a user to a group."""
        try:
            admin = cls.get_admin_client()
            admin.group_user_add(user_id=user_id, group_id=group_id)
        except Exception as e:
            logger.error(f"Error adding user {user_id} to group {group_id}: {e}")
            cls._admin_client = None
            raise

    @classmethod
    def remove_user_from_group(cls, user_id: str, group_id: str):
        """Remove a user from a group."""
        try:
            admin = cls.get_admin_client()
            admin.group_user_remove(user_id=user_id, group_id=group_id)
        except Exception as e:
            logger.error(f"Error removing user {user_id} from group {group_id}: {e}")
            cls._admin_client = None
            raise

    @classmethod
    def get_user_groups(cls, user_id: str) -> list:
        """Get groups a user belongs to."""
        try:
            admin = cls.get_admin_client()
            return admin.get_user_groups(user_id=user_id)
        except Exception as e:
            logger.error(f"Error fetching groups for user {user_id}: {e}")
            cls._admin_client = None
            return []

    @classmethod
    def get_all_groups(cls) -> list:
        """Get all groups in the realm."""
        try:
            admin = cls.get_admin_client()
            return admin.get_groups()
        except Exception as e:
            logger.error(f"Error fetching all groups: {e}")
            cls._admin_client = None
            return []

    @classmethod
    def get_client_id(cls, client_name: str) -> Optional[str]:
        """Get client UUID by client_id (name)."""
        try:
            admin = cls.get_admin_client()
            # This returns the internal UUID of the client
            return admin.get_client_id(client_name)
        except Exception as e:
            logger.error(f"Error getting client ID for {client_name}: {e}")
            cls._admin_client = None
            return None

    @classmethod
    def get_client_role(cls, client_uuid: str, role_name: str) -> Optional[dict]:
        """Get role representation for a client."""
        try:
            admin = cls.get_admin_client()
            return admin.get_client_role(client_id=client_uuid, role_name=role_name)
        except Exception as e:
            logger.error(
                f"Error getting role {role_name} for client {client_uuid}: {e}"
            )
            cls._admin_client = None
            return None

    @classmethod
    def assign_group_client_roles(cls, group_id: str, client_uuid: str, roles: list):
        """Assign client roles to a group."""
        try:
            admin = cls.get_admin_client()
            admin.assign_group_client_roles(
                group_id=group_id, client_id=client_uuid, roles=roles
            )
        except Exception as e:
            logger.error(
                f"Error assigning client roles {roles} to group {group_id}: {e}"
            )
            cls._admin_client = None
            raise

    # ------------------------------------------------------------------
    # Group Attributes (Keycloak-centric model)
    # ------------------------------------------------------------------

    @classmethod
    def set_group_attributes(cls, group_id: str, attributes: dict):
        """
        Set/update attributes on a Keycloak group.
        Keycloak stores attributes as lists of strings.
        """
        try:
            admin = cls.get_admin_client()
            group = admin.get_group(group_id=group_id)
            existing_attrs = group.get("attributes", {})

            for k, v in attributes.items():
                existing_attrs[k] = [str(v)] if not isinstance(v, list) else v

            admin.update_group(group_id=group_id, payload={"attributes": existing_attrs})
            logger.info(f"Set attributes on group {group_id}: {list(attributes.keys())}")
        except Exception as e:
            logger.error(f"Error setting attributes on group {group_id}: {e}")
            cls._admin_client = None
            raise

    @classmethod
    def get_group_attributes(cls, group_id: str) -> dict:
        """
        Get attributes from a Keycloak group, unwrapping single-value lists.
        Returns: {"schema_name": "my_schema", ...}
        """
        try:
            admin = cls.get_admin_client()
            group = admin.get_group(group_id=group_id)
            attrs = group.get("attributes", {})
            # Unwrap single-value lists for convenience
            return {
                k: v[0] if isinstance(v, list) and len(v) == 1 else v
                for k, v in attrs.items()
            }
        except Exception as e:
            logger.error(f"Error getting attributes for group {group_id}: {e}")
            cls._admin_client = None
            return {}

    @classmethod
    def get_group_schema_name(cls, group_id: str) -> Optional[str]:
        """Get the schema_name attribute from a group (shorthand)."""
        attrs = cls.get_group_attributes(group_id)
        schema = attrs.get("schema_name")
        if schema and schema.strip():
            return schema
        return None
