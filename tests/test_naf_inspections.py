"""Backend API tests for NAF 19-point inspection app"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://doc-to-mobile-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TEST_EMAIL = "test@naf.com"
TEST_PASSWORD = "123456"
TEST_NAME = "Inspector Test"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(session):
    # Try login first; if 401, register
    r = session.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=20)
    if r.status_code == 200:
        return r.json()["access_token"]
    r2 = session.post(f"{API}/auth/register", json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "name": TEST_NAME}, timeout=20)
    assert r2.status_code == 200, f"register failed: {r2.status_code} {r2.text}"
    return r2.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Health ----------
def test_root(session):
    r = session.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------- Auth ----------
def test_register_duplicate_returns_400(session, auth_token):
    r = session.post(f"{API}/auth/register", json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "name": TEST_NAME}, timeout=15)
    assert r.status_code == 400


def test_register_new_user(session):
    email = f"test_{uuid.uuid4().hex[:8]}@naf.com"
    r = session.post(f"{API}/auth/register", json={"email": email, "password": "abc123", "name": "TEST_New"}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["user"]["email"] == email
    assert data["user"]["name"] == "TEST_New"


def test_login_success(session):
    r = session.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert "access_token" in j and j["user"]["email"] == TEST_EMAIL


def test_login_wrong_password(session):
    r = session.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": "wrong"}, timeout=15)
    assert r.status_code == 401


def test_me_with_token(session, auth_token):
    r = session.get(f"{API}/auth/me", headers=_auth_headers(auth_token), timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == TEST_EMAIL


def test_me_without_token(session):
    r = session.get(f"{API}/auth/me", timeout=15)
    assert r.status_code in (401, 403)


def test_inspections_list_without_token(session):
    r = session.get(f"{API}/inspections", timeout=15)
    assert r.status_code in (401, 403)


# ---------- Inspections ----------
def _make_points(all_bueno=True, malo_index=None):
    pts = []
    for i in range(1, 20):
        estado = "bueno"
        comentarios = ""
        if malo_index is not None and i == malo_index:
            estado = "malo"
            comentarios = "Falla detectada en pruebas"
        pts.append({"number": i, "name": f"Punto {i}", "estado": estado, "comentarios": comentarios})
    return pts


def test_create_inspection_status_bueno(session, auth_token):
    payload = {
        "compania_transportista": "TEST_Transportes SA",
        "placas_unidad": "ABC-1234",
        "numero_trailer": "TR-001",
        "numero_precinto": "P-99",
        "sello_alta_seguridad": "SAS-01",
        "sello_verificado": True,
        "points": _make_points(all_bueno=True),
        "actividad_sospechosa": "Ninguna",
        "inspector_nombre": "Inspector Test",
        "inspector_firma": "data:image/png;base64,iVBORw0KGgo=",
    }
    r = session.post(f"{API}/inspections", json=payload, headers=_auth_headers(auth_token), timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status_general"] == "bueno"
    assert len(data["points"]) == 19
    assert data["compania_transportista"] == "TEST_Transportes SA"
    # GET single
    r2 = session.get(f"{API}/inspections/{data['id']}", headers=_auth_headers(auth_token), timeout=15)
    assert r2.status_code == 200
    assert r2.json()["id"] == data["id"]


def test_create_inspection_status_malo(session, auth_token):
    payload = {
        "compania_transportista": "TEST_Mala SA",
        "placas_unidad": "XYZ-9999",
        "numero_trailer": "TR-002",
        "numero_precinto": "P-100",
        "sello_alta_seguridad": "SAS-02",
        "sello_verificado": False,
        "points": _make_points(malo_index=5),
        "actividad_sospechosa": "Persona sospechosa",
        "inspector_nombre": "Inspector Test",
        "inspector_firma": "data:image/png;base64,iVBORw0KGgo=",
    }
    r = session.post(f"{API}/inspections", json=payload, headers=_auth_headers(auth_token), timeout=20)
    assert r.status_code == 200
    assert r.json()["status_general"] == "malo"


def test_list_inspections_sorted_desc(session, auth_token):
    r = session.get(f"{API}/inspections", headers=_auth_headers(auth_token), timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    assert len(items) >= 2
    created = [i["created_at"] for i in items]
    assert created == sorted(created, reverse=True), "List should be sorted desc by created_at"


def test_get_inspection_not_owner_returns_404(session, auth_token):
    # Create new user and try to access first user's inspection
    email = f"test_{uuid.uuid4().hex[:8]}@naf.com"
    reg = session.post(f"{API}/auth/register", json={"email": email, "password": "abc123", "name": "TEST_Other"}, timeout=15)
    other_token = reg.json()["access_token"]
    # Get an inspection id from first user
    r = session.get(f"{API}/inspections", headers=_auth_headers(auth_token), timeout=15)
    items = r.json()
    assert items, "Need an existing inspection"
    insp_id = items[0]["id"]
    r2 = session.get(f"{API}/inspections/{insp_id}", headers=_auth_headers(other_token), timeout=15)
    assert r2.status_code == 404


def test_offline_dedup_client_uuid(session, auth_token):
    cuid = str(uuid.uuid4())
    payload = {
        "compania_transportista": "TEST_Dedup",
        "placas_unidad": "DUP-111",
        "numero_trailer": "TR-D",
        "numero_precinto": "P-D",
        "sello_alta_seguridad": "SAS-D",
        "sello_verificado": True,
        "points": _make_points(),
        "actividad_sospechosa": "",
        "inspector_nombre": "Inspector Test",
        "inspector_firma": "data:image/png;base64,iVBORw0KGgo=",
        "client_uuid": cuid,
    }
    r1 = session.post(f"{API}/inspections", json=payload, headers=_auth_headers(auth_token), timeout=20)
    r2 = session.post(f"{API}/inspections", json=payload, headers=_auth_headers(auth_token), timeout=20)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"], "Dedup should return same inspection"
