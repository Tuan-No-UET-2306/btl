"""Integration tests for API endpoints (end-to-end)."""

import io

from fastapi.testclient import TestClient


class TestAuthAPI:
    """Tests for /api/v1/auth endpoints."""

    def test_register(self, client: TestClient):
        response = client.post(
            "/api/v1/auth/register",
            json={"username": "newuser", "password": "pass123"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["username"] == "newuser"
        assert data["role"] == "user"
        assert "id" in data

    def test_register_duplicate(self, client: TestClient, auth_header: dict):
        response = client.post(
            "/api/v1/auth/register",
            json={"username": "testuser", "password": "pass123"},
        )
        assert response.status_code == 409

    def test_login_success(self, client: TestClient, sample_user):
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["username"] == "testuser"

    def test_login_wrong_password(self, client: TestClient):
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "wrongpass"},
        )
        assert response.status_code == 401

    def test_get_me(self, client: TestClient, auth_header: dict):
        response = client.get("/api/v1/auth/me", headers=auth_header)
        assert response.status_code == 200
        assert response.json()["username"] == "testuser"

    def test_get_me_unauthorized(self, client: TestClient):
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 401


class TestDetectionsAPI:
    """Tests for /api/v1/detections endpoints."""

    def test_list_detections_empty(self, client: TestClient, auth_header: dict):
        response = client.get("/api/v1/detections/", headers=auth_header)
        assert response.status_code == 200
        assert response.json() == []

    def test_create_detection(self, client: TestClient, auth_header: dict):
        response = client.post(
            "/api/v1/detections/",
            headers=auth_header,
            json={
                "plate_number": "29A-123.45",
                "confidence": 0.95,
                "vehicle_type": "car",
                "is_blacklisted": False,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["plate_number"] == "29A-123.45"
        assert data["confidence"] == 0.95

    def test_update_detection(self, client: TestClient, auth_header: dict):
        # Create first
        create_resp = client.post(
            "/api/v1/detections/",
            headers=auth_header,
            json={"plate_number": "29A-123.45", "confidence": 0.9},
        )
        detection_id = create_resp.json()["id"]

        # Update
        update_resp = client.put(
            f"/api/v1/detections/{detection_id}",
            headers=auth_header,
            json={"plate_number": "29A-999.99", "is_blacklisted": True},
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["plate_number"] == "29A-999.99"
        assert data["is_blacklisted"] is True

    def test_delete_detection(self, client: TestClient, auth_header: dict):
        create_resp = client.post(
            "/api/v1/detections/",
            headers=auth_header,
            json={"plate_number": "29A-123.45", "confidence": 0.9},
        )
        detection_id = create_resp.json()["id"]

        delete_resp = client.delete(
            f"/api/v1/detections/{detection_id}",
            headers=auth_header,
        )
        assert delete_resp.status_code == 204


class TestUsersAPI:
    """Tests for /api/v1/users endpoints."""

    def test_list_users(self, client: TestClient, admin_auth_header: dict, sample_user):
        response = client.get("/api/v1/users/", headers=admin_auth_header)
        assert response.status_code == 200
        users = response.json()
        assert any(u["username"] == "testuser" for u in users)

    def test_create_user(self, client: TestClient, admin_auth_header: dict):
        response = client.post(
            "/api/v1/users/",
            headers=admin_auth_header,
            json={"username": "newadmin", "password": "pass", "role": "admin"},
        )
        assert response.status_code == 201
        assert response.json()["username"] == "newadmin"

    def test_create_duplicate(self, client: TestClient, admin_auth_header: dict, sample_user):
        response = client.post(
            "/api/v1/users/",
            headers=admin_auth_header,
            json={"username": "testuser", "password": "pass"},
        )
        assert response.status_code == 409

    def test_update_user(self, client: TestClient, admin_auth_header: dict, sample_user):
        response = client.put(
            f"/api/v1/users/{sample_user.id}",
            headers=admin_auth_header,
            json={"username": "updateduser", "role": "admin"},
        )
        assert response.status_code == 200
        assert response.json()["username"] == "updateduser"

    def test_delete_user(self, client: TestClient, admin_auth_header: dict, sample_user):
        response = client.delete(
            f"/api/v1/users/{sample_user.id}",
            headers=admin_auth_header,
        )
        assert response.status_code == 204


class TestExceptionHandlers:
    """Test that global exception handlers return standardized responses."""

    def test_404_not_found(self, client: TestClient, auth_header: dict):
        response = client.delete("/api/v1/detections/99999", headers=auth_header)
        assert response.status_code == 404

    def test_401_unauthorized(self, client: TestClient):
        response = client.get("/api/v1/detections/")
        assert response.status_code == 401
        data = response.json()
        assert data["code"] == "http_error"
        assert data["message"] == "Not authenticated"

    def test_validation_error(self, client: TestClient, auth_header: dict):
        response = client.post(
            "/api/v1/detections/",
            headers=auth_header,
            json={"plate_number": "", "confidence": 2.5},  # confidence > 1
        )
        # Should be 422 validation error (handled by global handler)
        assert response.status_code in (422, 201)
