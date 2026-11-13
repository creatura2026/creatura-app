"""Administration du catalogue : l'admin ne joue pas, ajoute des cartes et change leur rareté.

Tout changement de l'administrateur s'applique au prochain minuit (pass_midnight le simule).
"""

from conftest import (
    API,
    booster_history,
    give,
    not_first_booster,
    pass_midnight,
    problem,
    register_and_login,
    set_weights,
)

NEW_CARD = {
    "name": "Pixelion",
    "description": "Créée par l'administrateur.",
    "family": "LUEUR",
    "rarity": "LEGENDARY",
    "image": "sprites/eye_orb_2.png",
    "stock": 3,
}


def names(client, headers, **params) -> list[str]:
    page = client.get(f"{API}/creatures", params={"pageSize": 100, **params}, headers=headers).json()
    return [c["name"] for c in page["items"]]


def test_admin_cannot_play(client, admin_headers):
    player = register_and_login(client, "Lina")
    for method, path in (
        ("get", "/me/boosters/today"),
        ("post", "/me/boosters"),
        ("get", "/me/collection"),
        ("get", "/trades"),
        ("get", "/players"),
        ("get", f"/players/{player['id']}/tradeable-cards"),
    ):
        problem(getattr(client, method)(f"{API}{path}", headers=admin_headers), 403, "FORBIDDEN")
    r = client.post(f"{API}/trades", json={"recipientId": str(player["id"])}, headers=admin_headers)
    problem(r, 403, "FORBIDDEN")
    # Il garde l'accès au catalogue et à son profil.
    assert client.get(f"{API}/creatures", headers=admin_headers).status_code == 200
    assert client.get(f"{API}/me", headers=admin_headers).json()["role"] == "ADMIN"


def test_admin_is_not_listed_as_a_player(client):
    h = register_and_login(client, "Lina")["headers"]
    players = client.get(f"{API}/players", params={"search": "adm"}, headers=h).json()
    assert players["items"] == []


def test_new_card_appears_at_midnight(client, admin_headers):
    h = register_and_login(client, "Lina")["headers"]
    r = client.post(f"{API}/admin/creatures", json=NEW_CARD, headers=admin_headers)
    assert r.status_code == 201, r.text
    card = r.json()
    assert card["rarity"]["code"] == "LEGENDARY" and card["stockTotal"] == card["stockRemaining"] == 3
    assert card["imageUrl"].endswith("/sprites/eye_orb_2.png")

    # Invisible pour les joueurs jusqu'à minuit, visible pour l'administrateur.
    assert "Pixelion" not in names(client, h)
    problem(client.get(f"{API}/creatures/{card['id']}", headers=h), 404, "NOT_FOUND")
    admin_list = client.get(f"{API}/admin/creatures", headers=admin_headers).json()
    assert any(c["name"] == "Pixelion" and c["availableFrom"] == card["availableFrom"] for c in admin_list)

    pass_midnight()
    assert "Pixelion" in names(client, h)
    assert client.get(f"{API}/creatures/{card['id']}", headers=h).json()["name"] == "Pixelion"


def test_new_limited_edition_is_drawn_within_its_stock(client, admin_headers):
    card = client.post(f"{API}/admin/creatures", json=NEW_CARD, headers=admin_headers).json()
    set_weights(COMMUN=1, PEU_COMMUN=0, RARE=0, LEGENDAIRE=1000)
    with_old_legendaries_out = {"Serazou": 0, "DioDaLionseau": 0}
    from conftest import set_stock

    set_stock(with_old_legendaries_out)
    players = [register_and_login(client, f"Joueur{i}") for i in range(4)]
    not_first_booster(*(p["id"] for p in players))

    # Pas encore disponible : aucune légendaire tirable ce jour.
    first = client.post(f"{API}/me/boosters", headers=players[0]["headers"]).json()["cards"]
    assert all(c["creature"]["rarity"]["code"] != "LEGENDARY" for c in first)

    pass_midnight()
    drawn = 0
    for p in players[1:]:
        cards = client.post(f"{API}/me/boosters", headers=p["headers"]).json()["cards"]
        drawn += sum(c["creature"]["id"] == card["id"] for c in cards)
    assert drawn == 3  # un par booster (exclusion), et pas plus que l'édition limitée


def test_card_validation(client, admin_headers):
    for body, field in (
        ({**NEW_CARD, "stock": None}, "stock"),  # légendaire sans nombre d'exemplaires
        ({**NEW_CARD, "rarity": "RARE"}, "stock"),  # stock hors légendaire
        ({**NEW_CARD, "image": "https://exemple.test/x.png"}, "image"),
        ({**NEW_CARD, "name": "Moussou"}, "name"),  # nom déjà pris
    ):
        body = {k: v for k, v in body.items() if v is not None}
        r = problem(client.post(f"{API}/admin/creatures", json=body, headers=admin_headers), 400, "VALIDATION_ERROR")
        assert any(e["field"] == field for e in r.get("errors", [])), r


def test_rarity_change_applies_at_midnight(client, admin_headers):
    h = register_and_login(client, "Lina")
    give(h["id"], "Moussou", 2)
    moussou = next(c for c in client.get(f"{API}/admin/creatures", headers=admin_headers).json() if c["name"] == "Moussou")
    assert moussou["rarity"]["code"] == "COMMON" and moussou["stockTotal"] is None

    r = client.put(f"{API}/admin/creatures/{moussou['id']}/rarity", json={"rarity": "LEGENDARY", "stock": 5}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["scheduledChange"]["rarity"]["code"] == "LEGENDARY" and r.json()["rarity"]["code"] == "COMMON"

    pass_midnight()
    after = client.get(f"{API}/creatures/{moussou['id']}", headers=h["headers"]).json()
    assert after["rarity"]["code"] == "LEGENDARY"
    admin_view = next(c for c in client.get(f"{API}/admin/creatures", headers=admin_headers).json() if c["name"] == "Moussou")
    # 5 nouveaux exemplaires à tirer ; les 2 déjà possédés comptent dans le total.
    assert (admin_view["stockRemaining"], admin_view["stockTotal"], admin_view["scheduledChange"]) == (5, 7, None)

    # Retour à une rareté illimitée.
    client.put(f"{API}/admin/creatures/{moussou['id']}/rarity", json={"rarity": "RARE"}, headers=admin_headers)
    pass_midnight()
    admin_view = next(c for c in client.get(f"{API}/admin/creatures", headers=admin_headers).json() if c["name"] == "Moussou")
    assert admin_view["rarity"]["code"] == "RARE" and admin_view["stockTotal"] is None


def test_rarity_change_can_be_cancelled_and_is_validated(client, admin_headers):
    moussou = next(c for c in client.get(f"{API}/admin/creatures", headers=admin_headers).json() if c["name"] == "Moussou")
    url = f"{API}/admin/creatures/{moussou['id']}/rarity"
    problem(client.put(url, json={"rarity": "LEGENDARY"}, headers=admin_headers), 400, "VALIDATION_ERROR")
    problem(client.put(url, json={"rarity": "COMMON"}, headers=admin_headers), 400, "VALIDATION_ERROR")
    client.put(url, json={"rarity": "RARE"}, headers=admin_headers)
    assert client.delete(url, headers=admin_headers).json()["scheduledChange"] is None
    pass_midnight()
    assert next(c for c in client.get(f"{API}/admin/creatures", headers=admin_headers).json() if c["name"] == "Moussou")["rarity"]["code"] == "COMMON"


def test_first_booster_rare_is_counted_in_stats(client, admin_headers):
    p = register_and_login(client, "Lina")
    client.post(f"{API}/me/boosters", headers=p["headers"])
    assert len(booster_history(p["id"])) == 5
    dist = client.get(f"{API}/admin/rarity-distribution", headers=admin_headers).json()
    assert dist["totalCardsDistributed"] == 5
    assert next(i for i in dist["items"] if i["rarity"]["code"] == "RARE")["observedCount"] >= 1
