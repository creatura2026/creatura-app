"""Administration du catalogue : l'admin ne joue pas, ajoute des cartes et change leur rareté.

Tout changement de l'administrateur s'applique au prochain minuit (pass_midnight le simule).
"""

from conftest import (
    API,
    assert_stock_invariant,
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
    from conftest import set_stock

    set_stock({}, others=0)  # légendaires du catalogue épuisées : seule la nouvelle reste tirable
    card = client.post(f"{API}/admin/creatures", json=NEW_CARD, headers=admin_headers).json()
    set_weights(COMMUN=1, PEU_COMMUN=0, RARE=0, LEGENDAIRE=1000)
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


def test_rarity_change_applies_immediately(client, admin_headers):
    """La rareté change tout de suite (plus de passage de minuit), vue aussitôt par un joueur."""
    h = register_and_login(client, "Lina")["headers"]
    moussou = _creature(client, admin_headers, "Moussou")
    assert moussou["rarity"]["code"] == "COMMON" and moussou["stockTotal"] is None

    r = client.patch(f"{API}/admin/creatures/{moussou['id']}", json={"rarity": "RARE"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["rarity"]["code"] == "RARE" and r.json()["scheduledChange"] is None
    assert client.get(f"{API}/creatures/{moussou['id']}", headers=h).json()["rarity"]["code"] == "RARE"

    # Devient légendaire : stock initial immédiat (édition limitée créée maintenant).
    r = client.patch(f"{API}/admin/creatures/{moussou['id']}", json={"rarity": "LEGENDARY", "stock": 4}, headers=admin_headers)
    assert (r.json()["rarity"]["code"], r.json()["stockTotal"], r.json()["stockRemaining"]) == ("LEGENDARY", 4, 4)
    assert r.json()["scheduledChange"] is None

    # Retour à une rareté illimitée : stock effacé, tout de suite.
    r = client.patch(f"{API}/admin/creatures/{moussou['id']}", json={"rarity": "COMMON"}, headers=admin_headers)
    assert r.json()["rarity"]["code"] == "COMMON" and r.json()["stockTotal"] is None


def test_becoming_legendary_counts_already_held_copies(client, admin_headers):
    """Les exemplaires déjà possédés comptent dans l'édition : total = stock, tirables = stock - détenus."""
    h = register_and_login(client, "Lina")
    give(h["id"], "Moussou", 2)
    moussou = _creature(client, admin_headers, "Moussou")

    # Stock inférieur aux exemplaires déjà distribués : refusé.
    problem(
        client.patch(f"{API}/admin/creatures/{moussou['id']}", json={"rarity": "LEGENDARY", "stock": 1}, headers=admin_headers),
        400,
        "VALIDATION_ERROR",
    )
    r = client.patch(f"{API}/admin/creatures/{moussou['id']}", json={"rarity": "LEGENDARY", "stock": 7}, headers=admin_headers)
    assert (r.json()["stockTotal"], r.json()["stockRemaining"]) == (7, 5)  # 2 déjà détenus
    assert_stock_invariant()


def test_stock_increase_applies_at_midnight(client, admin_headers):
    """Une hausse d'exemplaires d'une légendaire prend effet au prochain minuit, jamais tout de suite."""
    moussou = _creature(client, admin_headers, "Moussou")
    client.patch(f"{API}/admin/creatures/{moussou['id']}", json={"rarity": "LEGENDARY", "stock": 3}, headers=admin_headers)

    r = client.patch(f"{API}/admin/creatures/{moussou['id']}", json={"stock": 8}, headers=admin_headers)
    assert r.status_code == 200, r.text
    # Rien ne change tout de suite ; la hausse est seulement programmée.
    assert (r.json()["stockTotal"], r.json()["stockRemaining"]) == (3, 3)
    assert r.json()["scheduledChange"]["stock"] == 8 and r.json()["scheduledChange"]["rarity"]["code"] == "LEGENDARY"

    pass_midnight()
    after = _creature(client, admin_headers, "Moussou")
    assert (after["stockTotal"], after["stockRemaining"], after["scheduledChange"]) == (8, 8, None)
    assert_stock_invariant()


def test_stock_cannot_decrease(client, admin_headers):
    moussou = _creature(client, admin_headers, "Moussou")
    client.patch(f"{API}/admin/creatures/{moussou['id']}", json={"rarity": "LEGENDARY", "stock": 5}, headers=admin_headers)
    r = problem(
        client.patch(f"{API}/admin/creatures/{moussou['id']}", json={"stock": 2}, headers=admin_headers), 400, "VALIDATION_ERROR"
    )
    assert any(e["field"] == "stock" for e in r.get("errors", [])), r


def test_scheduled_stock_increase_can_be_cancelled(client, admin_headers):
    moussou = _creature(client, admin_headers, "Moussou")
    url = f"{API}/admin/creatures/{moussou['id']}"
    client.patch(url, json={"rarity": "LEGENDARY", "stock": 3}, headers=admin_headers)
    assert client.patch(url, json={"stock": 9}, headers=admin_headers).json()["scheduledChange"]["stock"] == 9
    assert client.delete(f"{url}/rarity", headers=admin_headers).json()["scheduledChange"] is None
    pass_midnight()
    assert _creature(client, admin_headers, "Moussou")["stockTotal"] == 3  # hausse annulée


def test_first_booster_rare_is_counted_in_stats(client, admin_headers):
    p = register_and_login(client, "Lina")
    client.post(f"{API}/me/boosters", headers=p["headers"])
    assert len(booster_history(p["id"])) == 5
    dist = client.get(f"{API}/admin/rarity-distribution", headers=admin_headers).json()
    assert dist["totalCardsDistributed"] == 5
    assert next(i for i in dist["items"] if i["rarity"]["code"] == "RARE")["observedCount"] >= 1


def _creature(client, admin_headers, name):
    return next(c for c in client.get(f"{API}/admin/creatures", headers=admin_headers).json() if c["name"] == name)


def test_update_creature_applies_immediately(client, admin_headers):
    """Nom, description et famille d'une carte changent tout de suite (pas au prochain minuit)."""
    moussou = _creature(client, admin_headers, "Moussou")
    r = client.patch(
        f"{API}/admin/creatures/{moussou['id']}",
        json={"name": "Moussoute", "description": "Relookée.", "family": "LUEUR"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Moussoute" and body["description"] == "Relookée." and body["family"]["code"] == "LUEUR"
    # Vu immédiatement par un joueur, sans passage de minuit.
    h = register_and_login(client, "Lina")["headers"]
    card = client.get(f"{API}/creatures/{moussou['id']}", headers=h).json()
    assert card["name"] == "Moussoute" and card["family"]["code"] == "LUEUR"


def test_update_creature_partial_keeps_other_fields(client, admin_headers):
    moussou = _creature(client, admin_headers, "Moussou")
    r = client.patch(
        f"{API}/admin/creatures/{moussou['id']}", json={"description": "Juste la description."}, headers=admin_headers
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Moussou" and r.json()["description"] == "Juste la description."


def test_update_creature_duplicate_name_rejected(client, admin_headers):
    moussou = _creature(client, admin_headers, "Moussou")
    other = next(
        c for c in client.get(f"{API}/admin/creatures", headers=admin_headers).json() if c["name"] != "Moussou"
    )
    r = client.patch(f"{API}/admin/creatures/{moussou['id']}", json={"name": other["name"]}, headers=admin_headers)
    problem(r, 400, "VALIDATION_ERROR")


def test_update_creature_requires_admin(client):
    h = register_and_login(client, "Lina")["headers"]
    moussou_id = client.get(f"{API}/creatures", params={"pageSize": 1}, headers=h).json()["items"][0]["id"]
    problem(client.patch(f"{API}/admin/creatures/{moussou_id}", json={"name": "Pirate"}, headers=h), 403, "FORBIDDEN")
