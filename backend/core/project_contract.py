"""Project metadata contract. Machine paths stay in local device bindings."""
from core.test_contract import valid_url


def normalize_project(data):
    result = dict(data)
    kind = result.get("project_type", "web")
    if kind not in {"web", "desktop"}:
        raise ValueError("project_type must be web or desktop")
    if not isinstance(result.get("name"), str) or not result["name"].strip():
        raise ValueError("Project name is required")
    if not result.get("user_id"):
        raise ValueError("user_id is required")
    if kind == "web":
        if not isinstance(result.get("app_url"), str) or not valid_url(result["app_url"]):
            raise ValueError("Web projects require a valid HTTP or HTTPS app_url")
    else:
        result["app_url"] = None
        if result.get("face_auth_enabled"):
            raise ValueError("Virtual webcam authentication is currently supported only for web projects")
    result["project_type"] = kind
    return result
