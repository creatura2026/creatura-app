from conftest import API, creature_id, give, register_and_login, set_stock


def test_catalog_filters(client):
    h = register_and_login(client, "Lina")["headers"]
    all_ = client.get(f"{API}/creatures", headers=h).json()
    assert len(all_) == 16
    moussou = all_[0]
    assert moussou == {
        "id": moussou["id"],
        "name": "Moussou",
        "description": "Habite les sous-bois.",
        "family": "NATURE",
        "rarity": "COMMUN",
        "image": "images/moussou.png",
        "stock_total": 500,
        "stock_remaining": 500,
    }

    r = client.get(f"{API}/creatures", params={"search": "mous"}, headers=h).json()
    assert [c["name"] for c in r] == ["Moussou"]

    nature = client.get(f"{API}/creatures", params={"family": "NATURE"}, headers=h).json()
    assert len(nature) == 4 and {c["family"] for c in nature} == {"NATURE"}
    rares = client.get(f"{API}/creatures", params={"family": "BRUME", "rarity": "RARE"}, headers=h).json()
    assert [c["name"] for c in rares] == ["Brumel"]
    assert client.get(f"{API}/creatures", params={"family": "ONDE"}, headers=h).status_code == 422

    families = client.get(f"{API}/families", headers=h).json()
    assert [f["code"] for f in families] == ["NATURE", "CRISTAL", "BRUME", "LUEUR"]

    rarities = client.get(f"{API}/rarities", headers=h).json()
    assert [(r["code"], r["drop_rate_percent"]) for r in rarities] == [
        ("COMMUN", 64.0), ("PEU_COMMUN", 24.0), ("RARE", 12.0)
    ]

    assert client.get(f"{API}/creatures/{creature_id('Brumel')}", headers=h).json()["name"] == "Brumel"
    assert client.get(f"{API}/creatures/9999", headers=h).status_code == 404


def test_exhausted_creature_leaves_draw_probabilities(client):
    h = register_and_login(client, "Lina")["headers"]
    set_stock({"Moussou": 10, "Brumel": 10})  # poids 8 et 3
    rates = {r["code"]: r["drop_rate_percent"] for r in client.get(f"{API}/rarities", headers=h).json()}
    assert rates == {"COMMUN": 72.73, "PEU_COMMUN": 0.0, "RARE": 27.27}


def test_collection_filters(client):
    p = register_and_login(client, "Lina")
    give(p["id"], "Moussou", 3)
    give(p["id"], "Flammille", 1)
    h = p["headers"]

    r = client.get(f"{API}/me/collection", headers=h).json()
    assert len(r["items"]) == 16
    assert r["summary"] == {
        "owned_distinct": 2,
        "total_creatures": 16,
        "completion_percent": 12.5,
        "total_cards": 4,
        "duplicates": 2,
    }

    owned = client.get(f"{API}/me/collection", params={"status": "owned"}, headers=h).json()["items"]
    assert {(i["creature"]["name"], i["quantity"]) for i in owned} == {("Moussou", 3), ("Flammille", 1)}

    dups = client.get(f"{API}/me/collection", params={"status": "duplicates"}, headers=h).json()["items"]
    assert [i["creature"]["name"] for i in dups] == ["Moussou"]

    missing = client.get(f"{API}/me/collection", params={"status": "missing"}, headers=h).json()["items"]
    assert len(missing) == 14 and all(i["quantity"] == 0 for i in missing)

    lueur = client.get(f"{API}/me/collection", params={"status": "owned", "family": "LUEUR"}, headers=h).json()
    assert [i["creature"]["name"] for i in lueur["items"]] == ["Flammille"]
