"""Backend API tests for Iteration 2: roles, user management, supervisor approval, CSV export."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://doc-to-mobile-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "test@naf.com"
SUPER_PASSWORD = "123456"
INSPECTOR_EMAIL = "inspector1@naf.com"
INSPECTOR_PASSWORD = "123456"


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def super_token(session):
    r = session.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASSWORD}, timeout=20)
    if r.status_code != 200:
        # fallback: register (first user => supervisor)
        r = session.post(f"{API}/auth/register", json={"email": SUPER_EMAIL, "password": SUPER_PASSWORD, "name": "Supervisor"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def inspector_token(session, super_token):
    # Ensure inspector exists & active. Try login first.
    r = session.post(f"{API}/auth/login", json={"email": INSPECTOR_EMAIL, "password": INSPECTOR_PASSWORD}, timeout=20)
    if r.status_code == 200:
        return r.json()["access_token"]
    if r.status_code == 403:
        # Deactivated — reactivate
        ul = session.get(f"{API}/users", headers=_hdr(super_token), timeout=15).json()
        target = next((u for u in ul if u["email"] == INSPECTOR_EMAIL), None)
        if target and not target["active"]:
            session.post(f"{API}/users/{target['id']}/toggle-active", headers=_hdr(super_token), timeout=15)
            r = session.post(f"{API}/auth/login", json={"email": INSPECTOR_EMAIL, "password": INSPECTOR_PASSWORD}, timeout=20)
            if r.status_code == 200:
                return r.json()["access_token"]
    # Create inspector via supervisor endpoint
    r2 = session.post(
        f"{API}/users/create-inspector",
        json={"email": INSPECTOR_EMAIL, "password": INSPECTOR_PASSWORD, "name": "Inspector 1", "role": "inspector"},
        headers=_hdr(super_token), timeout=20,
    )
    assert r2.status_code in (200, 400), r2.text
    r3 = session.post(f"{API}/auth/login", json={"email": INSPECTOR_EMAIL, "password": INSPECTOR_PASSWORD}, timeout=20)
    assert r3.status_code == 200, r3.text
    return r3.json()["access_token"]


def _make_points():
    return [{"number": i, "name": f"Punto {i}", "estado": "bueno", "comentarios": ""} for i in range(1, 20)]


@pytest.fixture(scope="session")
def inspector_inspection_id(session, inspector_token):
    payload = {
        "compania_transportista": "TEST_IT2 Inspector Co",
        "placas_unidad": "INS-001",
        "numero_trailer": "TR-IT2",
        "numero_precinto": "P-IT2",
        "sello_alta_seguridad": "SAS-IT2",
        "sello_verificado": True,
        "points": _make_points(),
        "actividad_sospechosa": "",
        "inspector_nombre": "Inspector 1",
        "inspector_firma": "data:image/png;base64,iVBORw0KGgo=",
    }
    r = session.post(f"{API}/inspections", json=payload, headers=_hdr(inspector_token), timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ----------- /auth/me returns role and active -----------
def test_me_returns_role_and_active_supervisor(session, super_token):
    r = session.get(f"{API}/auth/me", headers=_hdr(super_token), timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j["role"] == "supervisor"
    assert j["active"] is True


def test_me_returns_role_and_active_inspector(session, inspector_token):
    r = session.get(f"{API}/auth/me", headers=_hdr(inspector_token), timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j["role"] == "inspector"
    assert j["active"] is True


# ----------- /users role-gated -----------
def test_users_list_supervisor_200(session, super_token):
    r = session.get(f"{API}/users", headers=_hdr(super_token), timeout=15)
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list) and len(arr) >= 1
    assert any(u["email"] == SUPER_EMAIL and u["role"] == "supervisor" for u in arr)


def test_users_list_inspector_403(session, inspector_token):
    r = session.get(f"{API}/users", headers=_hdr(inspector_token), timeout=15)
    assert r.status_code == 403


# ----------- create-inspector -----------
def test_create_inspector_by_supervisor(session, super_token):
    email = f"test_ins_{uuid.uuid4().hex[:6]}@naf.com"
    r = session.post(f"{API}/users/create-inspector",
                     json={"email": email, "password": "abc123", "name": "TEST_Ins New"},
                     headers=_hdr(super_token), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["role"] == "inspector"
    assert j["active"] is True
    assert j["email"] == email


def test_create_inspector_by_inspector_403(session, inspector_token):
    email = f"test_ins_{uuid.uuid4().hex[:6]}@naf.com"
    r = session.post(f"{API}/users/create-inspector",
                     json={"email": email, "password": "abc123", "name": "Nope"},
                     headers=_hdr(inspector_token), timeout=15)
    assert r.status_code == 403


# ----------- toggle-active -----------
def test_supervisor_cannot_deactivate_self(session, super_token):
    me = session.get(f"{API}/auth/me", headers=_hdr(super_token), timeout=15).json()
    r = session.post(f"{API}/users/{me['id']}/toggle-active", headers=_hdr(super_token), timeout=15)
    assert r.status_code == 400


def test_toggle_active_and_deactivated_login_blocked(session, super_token):
    # Create a fresh inspector to deactivate
    email = f"test_deact_{uuid.uuid4().hex[:6]}@naf.com"
    pwd = "abc123"
    cr = session.post(f"{API}/users/create-inspector",
                      json={"email": email, "password": pwd, "name": "TEST_Deact"},
                      headers=_hdr(super_token), timeout=15)
    assert cr.status_code == 200
    uid = cr.json()["id"]

    # Login works initially
    lr = session.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert lr.status_code == 200
    tok = lr.json()["access_token"]

    # Deactivate
    tr = session.post(f"{API}/users/{uid}/toggle-active", headers=_hdr(super_token), timeout=15)
    assert tr.status_code == 200
    assert tr.json()["active"] is False

    # Login now blocked (403)
    lr2 = session.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert lr2.status_code == 403

    # Existing token also rejected
    me2 = session.get(f"{API}/auth/me", headers=_hdr(tok), timeout=15)
    assert me2.status_code == 403

    # Reactivate -> login works again
    tr2 = session.post(f"{API}/users/{uid}/toggle-active", headers=_hdr(super_token), timeout=15)
    assert tr2.status_code == 200 and tr2.json()["active"] is True
    lr3 = session.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert lr3.status_code == 200


# ----------- inspections scope=all / 403 / 404 -----------
def test_inspections_scope_all_supervisor(session, super_token, inspector_inspection_id):
    r = session.get(f"{API}/inspections?scope=all", headers=_hdr(super_token), timeout=15)
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()]
    assert inspector_inspection_id in ids


def test_inspections_scope_all_inspector_403(session, inspector_token):
    r = session.get(f"{API}/inspections?scope=all", headers=_hdr(inspector_token), timeout=15)
    assert r.status_code == 403


def test_supervisor_can_get_any_inspection(session, super_token, inspector_inspection_id):
    r = session.get(f"{API}/inspections/{inspector_inspection_id}", headers=_hdr(super_token), timeout=15)
    assert r.status_code == 200
    assert r.json()["id"] == inspector_inspection_id


def test_inspector_404_on_not_owner(session, super_token, inspector_token):
    # Create inspection as supervisor, inspector tries to GET
    payload = {
        "compania_transportista": "TEST_IT2 Super Co", "placas_unidad": "SUP-001",
        "numero_trailer": "TR-S", "numero_precinto": "P-S",
        "sello_alta_seguridad": "SAS-S", "sello_verificado": True,
        "points": _make_points(), "actividad_sospechosa": "",
        "inspector_nombre": "Supervisor", "inspector_firma": "data:,",
    }
    cr = session.post(f"{API}/inspections", json=payload, headers=_hdr(super_token), timeout=20)
    assert cr.status_code == 200
    sid = cr.json()["id"]
    r = session.get(f"{API}/inspections/{sid}", headers=_hdr(inspector_token), timeout=15)
    assert r.status_code == 404


# ----------- approve / reject -----------
def test_approve_inspection(session, super_token, inspector_inspection_id):
    r = session.post(f"{API}/inspections/{inspector_inspection_id}/approve",
                     json={"note": "TEST_OK"}, headers=_hdr(super_token), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["approval_status"] == "aprobada"
    assert j["approval_note"] == "TEST_OK"
    assert j["approved_by_name"]  # supervisor name set
    # Verify persisted
    r2 = session.get(f"{API}/inspections/{inspector_inspection_id}", headers=_hdr(super_token), timeout=15)
    assert r2.json()["approval_status"] == "aprobada"


def test_reject_inspection(session, super_token, inspector_token):
    # Create a new inspection to reject
    payload = {
        "compania_transportista": "TEST_IT2 Rechazo", "placas_unidad": "REJ-001",
        "numero_trailer": "TR-R", "numero_precinto": "P-R",
        "sello_alta_seguridad": "SAS-R", "sello_verificado": False,
        "points": _make_points(), "actividad_sospechosa": "",
        "inspector_nombre": "Inspector 1", "inspector_firma": "data:,",
    }
    cr = session.post(f"{API}/inspections", json=payload, headers=_hdr(inspector_token), timeout=20)
    iid = cr.json()["id"]
    r = session.post(f"{API}/inspections/{iid}/reject",
                     json={"note": "TEST_FALLO"}, headers=_hdr(super_token), timeout=15)
    assert r.status_code == 200
    assert r.json()["approval_status"] == "rechazada"
    assert r.json()["approval_note"] == "TEST_FALLO"


def test_approve_by_inspector_403(session, inspector_token, inspector_inspection_id):
    r = session.post(f"{API}/inspections/{inspector_inspection_id}/approve",
                     json={"note": "x"}, headers=_hdr(inspector_token), timeout=15)
    assert r.status_code == 403


# ----------- CSV export -----------
def test_export_summary_mine(session, inspector_token):
    r = session.get(f"{API}/inspections/export?mode=summary&scope=mine", headers=_hdr(inspector_token), timeout=20)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("text/csv")
    body = r.text
    assert "ID Inspeccion" in body and "Placas" in body and "Aprobacion" in body
    # Should NOT have detailed-only header
    assert "Punto #" not in body


def test_export_detailed_all_supervisor(session, super_token):
    r = session.get(f"{API}/inspections/export?mode=detailed&scope=all", headers=_hdr(super_token), timeout=20)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("text/csv")
    body = r.text
    assert "Punto #" in body and "Estado" in body
    # At least 19 data rows per inspection — sanity: more than just header line
    assert body.count("\n") > 19


def test_export_detailed_all_inspector_403(session, inspector_token):
    r = session.get(f"{API}/inspections/export?mode=detailed&scope=all", headers=_hdr(inspector_token), timeout=20)
    assert r.status_code == 403
