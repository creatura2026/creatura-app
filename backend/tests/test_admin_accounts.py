"""AS-71 : joueurs, demandes de suppression et comptes admin dans le dashboard."""

import re

from conftest import API, auth_headers, conclude_trade, give, login, problem, register_and_login

NEW_PASSWORD = "nouveau-mot-de-passe"
TEMP_PASSWORD_FORMAT = r"^[a-z2-9]{4}(-[a-z2-9]{4}){3}$"


def create_admin(client, headers, pseudo: str) -> dict:
    """Crée un admin depuis le dashboard, le connecte et remplace son mot de passe provisoire."""
    r = client.post(f"{API}/admin/admins", json={"pseudo": pseudo, "login": pseudo.lower()}, headers=headers)
    assert r.status_code == 201, r.text
    temporary = r.json()["temporaryPassword"]
    h = auth_headers(login(client, pseudo.lower(), temporary))
    r = client.put(f"{API}/me/password", json={"currentPassword": temporary, "newPassword": NEW_PASSWORD}, headers=h)
    assert r.status_code == 200, r.text
    # Les jetons d'avant le changement sont révoqués : on garde ceux de la réponse.
    return {"id": r_id(client, headers, pseudo), "headers": auth_headers(r.json())}


def r_id(client, headers, pseudo: str) -> str:
    admins = client.get(f"{API}/admin/admins", headers=headers).json()
    return next(a["id"] for a in admins if a["pseudo"] == pseudo)


def players(client, headers, **params) -> dict:
    r = client.get(f"{API}/admin/players", params=params, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def request_deletion(client, headers, player_ids: list, validator_id: str, reason: str | None = None):
    body = {"playerIds": [str(p) for p in player_ids], "validatorId": validator_id}
    if reason is not None:
        body["reason"] = reason
    return client.post(f"{API}/admin/deletion-requests", json=body, headers=headers)


# ── Joueurs ──────────────────────────────────────────────────────────────────


def test_players_list_counts_logins_and_cards(client, admin_headers):
    alice = register_and_login(client, "Alice")  # 1 connexion
    login(client, "alice", "password-1234")  # 2e connexion
    bob = register_and_login(client, "Bob")
    client.post(f"{API}/auth/refresh", json={"refreshToken": bob["tokens"]["refreshToken"]})  # ne compte pas
    give(alice["id"], "Moussou", 3)

    page = players(client, admin_headers)
    assert page["totalItems"] == 2  # joueurs seulement, pas l'admin
    by_pseudo = {p["pseudo"]: p for p in page["items"]}
    assert by_pseudo["Alice"]["loginsInPeriod"] == 2 and by_pseudo["Bob"]["loginsInPeriod"] == 1
    assert by_pseudo["Alice"]["totalCards"] == 3 and by_pseudo["Bob"]["totalCards"] == 0
    assert by_pseudo["Alice"]["login"] == "alice" and by_pseudo["Alice"]["lastLoginAt"] is not None
    assert by_pseudo["Alice"]["pendingDeletionRequestId"] is None
    assert page["period"]["from"] and page["period"]["to"]

    assert [p["pseudo"] for p in players(client, admin_headers, sort="totalCards", order="desc")["items"]] == ["Alice", "Bob"]
    assert [p["pseudo"] for p in players(client, admin_headers, sort="pseudo", order="desc")["items"]] == ["Bob", "Alice"]
    assert [p["pseudo"] for p in players(client, admin_headers, search="lic")["items"]] == ["Alice"]


def test_player_detail(client, admin_headers):
    alice = register_and_login(client, "Alice")
    give(alice["id"], "Moussou", 2)
    give(alice["id"], "Brumel", 1)

    r = client.get(f"{API}/admin/players/{alice['id']}", headers=admin_headers)
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["player"]["pseudo"] == "Alice" and detail["player"]["totalCards"] == 3
    assert [x["rarity"]["code"] for x in detail["cardsByRarity"]] == ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"]
    assert sum(x["cards"] for x in detail["cardsByRarity"]) == 3
    assert sum(x["distinctCreatures"] for x in detail["cardsByRarity"]) == 2
    assert [x["family"]["code"] for x in detail["cardsByFamily"]] == ["NATURE", "CRISTAL", "BRUME", "LUEUR"]
    assert sum(x["cards"] for x in detail["cardsByFamily"]) == 3
    assert detail["logins"]["granularity"] == "DAY" and len(detail["logins"]["points"]) == 30
    assert detail["logins"]["points"][-1]["count"] == 1

    monthly = client.get(
        f"{API}/admin/players/{alice['id']}",
        params={"granularity": "MONTH", "from": "2026-01-01", "to": "2026-12-31"},
        headers=admin_headers,
    ).json()["logins"]
    assert [p["date"] for p in monthly["points"]][:2] == ["2026-01-01", "2026-02-01"] and len(monthly["points"]) == 12

    admin_id = r_id(client, admin_headers, "Admin")
    problem(client.get(f"{API}/admin/players/{admin_id}", headers=admin_headers), 404, "NOT_FOUND")


def test_player_is_denied_new_admin_routes(client):
    h = register_and_login(client, "Lina")["headers"]
    for route in ("/admin/players", "/admin/deletion-requests", "/admin/admins"):
        problem(client.get(f"{API}{route}", headers=h), 403, "FORBIDDEN")
    r = client.post(f"{API}/admin/admins", json={"pseudo": "Pirate", "login": "pirate"}, headers=h)
    problem(r, 403, "FORBIDDEN")


# ── Comptes admin ────────────────────────────────────────────────────────────


def test_create_admin_with_generated_temporary_password(client, admin_headers):
    r = client.post(f"{API}/admin/admins", json={"pseudo": "Noa", "login": "noa"}, headers=admin_headers)
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["createdBy"]["pseudo"] == "Admin" and created["mustChangePassword"] and created["active"]
    temporary = created["temporaryPassword"]
    assert re.fullmatch(TEMP_PASSWORD_FORMAT, temporary), temporary
    # Renvoyé une seule fois : la liste des admins ne le donne jamais.
    listed = client.get(f"{API}/admin/admins", headers=admin_headers).json()
    assert all("temporaryPassword" not in a for a in listed)
    # Le client ne peut pas imposer le mot de passe provisoire.
    r = client.post(
        f"{API}/admin/admins", json={"pseudo": "Lou", "login": "lou", "temporaryPassword": "choisi-a-la-main"}, headers=admin_headers
    )
    problem(r, 400, "VALIDATION_ERROR")
    # Deux créations : deux mots de passe différents.
    other = client.post(f"{API}/admin/admins", json={"pseudo": "Lou", "login": "lou"}, headers=admin_headers).json()
    assert other["temporaryPassword"] != temporary

    tokens = login(client, "noa", temporary)
    assert tokens["user"]["role"] == "ADMIN" and tokens["user"]["mustChangePassword"] is True
    h = auth_headers(tokens)
    problem(client.get(f"{API}/admin/stats", headers=h), 403, "PASSWORD_CHANGE_REQUIRED")

    r = client.put(f"{API}/me/password", json={"currentPassword": "mauvais-mot-de-passe", "newPassword": NEW_PASSWORD}, headers=h)
    problem(r, 400, "VALIDATION_ERROR")
    r = client.put(f"{API}/me/password", json={"currentPassword": temporary, "newPassword": NEW_PASSWORD}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["mustChangePassword"] is False
    h = auth_headers(r.json())  # les anciens jetons sont révoqués

    assert client.get(f"{API}/admin/stats", headers=h).status_code == 200
    assert login(client, "noa", NEW_PASSWORD)["user"]["mustChangePassword"] is False
    noa = next(a for a in client.get(f"{API}/admin/admins", headers=admin_headers).json() if a["pseudo"] == "Noa")
    assert noa["mustChangePassword"] is False and noa["lastLoginAt"] is not None

    r = client.post(f"{API}/admin/admins", json={"pseudo": "Noa2", "login": "noa"}, headers=admin_headers)
    problem(r, 409, "LOGIN_ALREADY_USED")
    r = client.post(f"{API}/admin/admins", json={"pseudo": "N", "login": "x"}, headers=admin_headers)
    problem(r, 400, "VALIDATION_ERROR")


def test_deactivate_admin(client, admin_headers):
    noa = create_admin(client, admin_headers, "Noa")
    me = r_id(client, admin_headers, "Admin")
    alice = register_and_login(client, "Alice")
    pending = request_deletion(client, noa["headers"], [alice["id"]], me).json()

    problem(client.post(f"{API}/admin/admins/{me}/deactivate", headers=admin_headers), 400, "VALIDATION_ERROR")
    # Il doit rester au moins deux admins actifs : avec Admin et Noa seuls, c'est refusé.
    problem(client.post(f"{API}/admin/admins/{noa['id']}/deactivate", headers=admin_headers), 400, "VALIDATION_ERROR")
    lou = create_admin(client, admin_headers, "Lou")
    r = client.post(f"{API}/admin/admins/{noa['id']}/deactivate", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["active"] is False and r.json()["deactivatedBy"]["pseudo"] == "Admin"

    problem(client.get(f"{API}/admin/stats", headers=noa["headers"]), 401, "UNAUTHENTICATED")  # jeton refusé
    r = client.post(f"{API}/auth/login", json={"login": "noa", "password": NEW_PASSWORD})
    problem(r, 403, "ACCOUNT_DISABLED")
    r = client.post(f"{API}/auth/login", json={"login": "noa", "password": "mauvais-mot-de-passe"})
    problem(r, 401, "INVALID_CREDENTIALS")  # rien n'est révélé sans le bon mot de passe

    # Ses demandes en attente sont annulées ; il ne peut plus être choisi comme validateur.
    requests = client.get(f"{API}/admin/deletion-requests", headers=admin_headers).json()["items"]
    assert next(x for x in requests if x["id"] == pending["id"])["status"] == "CANCELLED"
    problem(request_deletion(client, admin_headers, [alice["id"]], noa["id"]), 400, "VALIDATION_ERROR")
    problem(client.post(f"{API}/admin/admins/{noa['id']}/deactivate", headers=admin_headers), 404, "NOT_FOUND")
    # Admin et Lou sont les deux derniers actifs : aucun des deux ne peut désactiver l'autre.
    problem(client.post(f"{API}/admin/admins/{lou['id']}/deactivate", headers=admin_headers), 400, "VALIDATION_ERROR")


# ── Demandes de suppression ──────────────────────────────────────────────────


def test_deletion_request_approved_by_chosen_admin(client, admin_headers):
    noa = create_admin(client, admin_headers, "Noa")
    me = r_id(client, admin_headers, "Admin")
    alice, bob = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(alice["id"], "Moussou", 1)
    give(bob["id"], "Brumel", 1)
    trade = conclude_trade(client, alice, bob, {"Moussou": 1}, {"Brumel": 1})

    problem(request_deletion(client, admin_headers, [alice["id"]], me), 400, "VALIDATION_ERROR")  # soi-même
    problem(request_deletion(client, admin_headers, [me], noa["id"]), 400, "VALIDATION_ERROR")  # un admin

    r = request_deletion(client, admin_headers, [alice["id"]], noa["id"], "Compte de test")
    assert r.status_code == 201, r.text
    req = r.json()
    assert req["status"] == "PENDING" and req["accountCount"] == 1 and req["reason"] == "Compte de test"
    assert [p["pseudo"] for p in req["players"]] == ["Alice"]
    assert req["requestedBy"]["pseudo"] == "Admin" and req["validator"]["pseudo"] == "Noa"
    assert {p["pseudo"]: p for p in players(client, admin_headers)["items"]}["Alice"]["pendingDeletionRequestId"] == req["id"]
    problem(request_deletion(client, admin_headers, [alice["id"]], noa["id"]), 409, "PLAYER_ALREADY_REQUESTED")

    # Seul le validateur choisi décide ; il voit la demande dans « à valider ».
    problem(client.post(f"{API}/admin/deletion-requests/{req['id']}/approve", headers=admin_headers), 403, "FORBIDDEN")
    to_validate = client.get(f"{API}/admin/deletion-requests", params={"toValidate": True, "status": "PENDING"}, headers=noa["headers"])
    assert [x["id"] for x in to_validate.json()["items"]] == [req["id"]]
    assert client.get(f"{API}/admin/deletion-requests", params={"toValidate": True}, headers=admin_headers).json()["items"] == []

    r = client.post(f"{API}/admin/deletion-requests/{req['id']}/approve", headers=noa["headers"])
    assert r.status_code == 200, r.text
    done = r.json()
    assert done["status"] == "APPROVED" and done["decidedAt"] and done["accountCount"] == 1
    assert done["players"] == []  # le journal ne garde pas les joueurs supprimés

    # Alice n'existe plus ; Bob garde l'échange, avec « Joueur supprimé » à la place d'Alice.
    problem(client.post(f"{API}/auth/login", json={"login": "alice", "password": "password-1234"}), 401, "INVALID_CREDENTIALS")
    problem(client.get(f"{API}/me", headers=alice["headers"]), 401, "UNAUTHENTICATED")
    kept = client.get(f"{API}/trades/{trade['id']}", headers=bob["headers"]).json()
    assert kept["status"] == "ACCEPTED" and kept["proposer"]["pseudo"] == "Joueur supprimé"
    assert kept["recipient"]["pseudo"] == "Bob"
    assert [p["pseudo"] for p in players(client, admin_headers)["items"]] == ["Bob"]

    r = client.post(f"{API}/admin/deletion-requests/{req['id']}/reject", headers=noa["headers"])
    problem(r, 409, "REQUEST_NOT_PENDING")


def test_deletion_request_rejected_or_cancelled(client, admin_headers):
    noa = create_admin(client, admin_headers, "Noa")
    bob = register_and_login(client, "Bob")

    req = request_deletion(client, admin_headers, [bob["id"]], noa["id"]).json()
    r = client.post(f"{API}/admin/deletion-requests/{req['id']}/reject", headers=noa["headers"])
    assert r.status_code == 200 and r.json()["status"] == "REJECTED"
    assert [p["pseudo"] for p in r.json()["players"]] == ["Bob"]

    req = request_deletion(client, admin_headers, [bob["id"]], noa["id"]).json()
    problem(client.post(f"{API}/admin/deletion-requests/{req['id']}/cancel", headers=noa["headers"]), 403, "FORBIDDEN")
    r = client.post(f"{API}/admin/deletion-requests/{req['id']}/cancel", headers=admin_headers)
    assert r.status_code == 200 and r.json()["status"] == "CANCELLED"

    assert [p["pseudo"] for p in players(client, admin_headers)["items"]] == ["Bob"]  # personne n'est supprimé
    statuses = [x["status"] for x in client.get(f"{API}/admin/deletion-requests", headers=admin_headers).json()["items"]]
    assert statuses == ["CANCELLED", "REJECTED"]
    unknown = "00000000-0000-0000-0000-000000000099"
    problem(client.post(f"{API}/admin/deletion-requests/{unknown}/approve", headers=noa["headers"]), 404, "NOT_FOUND")
