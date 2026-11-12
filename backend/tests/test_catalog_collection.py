"""Catalogue et collection. Le catalogue vient de db/init/02_catalogue.sql : les tests ne
s'appuient que sur les créatures du cahier des charges (Moussou, Cristille, Brumel, Flammille)."""

from conftest import API, SessionLocal, creature_id, give, register_and_login, set_stock
from sqlalchemy import func, select

from app.models import Creature


def catalogue_size() -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(Creature))


def test_catalog_filters(client):
    h = register_and_login(client, "Lina")["headers"]
    all_ = client.get(f"{API}/creatures", headers=h).json()
    assert len(all_) == catalogue_size() > 0
    moussou = next(c for c in all_ if c["name"] == "Moussou")
    assert moussou == {
        "id": creature_id("Moussou"),
        "name": "Moussou",
        "description": "Habite les sous-bois.",
        "family": "NATURE",
        "rarity": "COMMUN",
        "image": "images/moussou.png",
        "stock_total": moussou["stock_total"],
        "stock_remaining": moussou["stock_total"],
    }

    r = client.get(f"{API}/creatures", params={"search": "mous"}, headers=h).json()
    assert [c["name"] for c in r] == ["Moussou"]

    nature = client.get(f"{API}/creatures", params={"family": "NATURE"}, headers=h).json()
    assert nature and {c["family"] for c in nature} == {"NATURE"}
    rare_brume = client.get(f"{API}/creatures", params={"family": "BRUME", "rarity": "RARE"}, headers=h).json()
    assert "Brumel" in [c["name"] for c in rare_brume]
    assert client.get(f"{API}/creatures", params={"family": "ONDE"}, headers=h).status_code == 422

    families = client.get(f"{API}/families", headers=h).json()
    assert [f["code"] for f in families] == ["NATURE", "CRISTAL", "BRUME", "LUEUR"]

    rarities = client.get(f"{API}/rarities", headers=h).json()
    assert [r["code"] for r in rarities] == ["COMMUN", "PEU_COMMUN", "RARE"]
    assert abs(sum(r["drop_rate_percent"] for r in rarities) - 100) < 0.1

    assert client.get(f"{API}/creatures/{creature_id('Brumel')}", headers=h).json()["name"] == "Brumel"
    assert client.get(f"{API}/creatures/999999", headers=h).status_code == 404


def test_draw_probabilities_follow_weights_and_stock(client):
    h = register_and_login(client, "Lina")["headers"]
    with SessionLocal() as db:
        poids = dict(db.execute(select(Creature.nom, Creature.poids)).all())
    set_stock({"Moussou": 10, "Brumel": 10})  # toutes les autres créatures sont épuisées
    rates = {r["code"]: r["drop_rate_percent"] for r in client.get(f"{API}/rarities", headers=h).json()}
    total = poids["Moussou"] + poids["Brumel"]
    assert rates == {
        "COMMUN": round(poids["Moussou"] * 100 / total, 2),
        "PEU_COMMUN": 0.0,
        "RARE": round(poids["Brumel"] * 100 / total, 2),
    }


def test_collection_filters(client):
    p = register_and_login(client, "Lina")
    give(p["id"], "Moussou", 3)
    give(p["id"], "Flammille", 1)
    h = p["headers"]
    n = catalogue_size()

    r = client.get(f"{API}/me/collection", headers=h).json()
    assert len(r["items"]) == n
    assert r["summary"] == {
        "owned_distinct": 2,
        "total_creatures": n,
        "completion_percent": round(2 * 100 / n, 1),
        "total_cards": 4,
        "duplicates": 2,
    }

    owned = client.get(f"{API}/me/collection", params={"status": "owned"}, headers=h).json()["items"]
    assert {(i["creature"]["name"], i["quantity"]) for i in owned} == {("Moussou", 3), ("Flammille", 1)}

    dups = client.get(f"{API}/me/collection", params={"status": "duplicates"}, headers=h).json()["items"]
    assert [i["creature"]["name"] for i in dups] == ["Moussou"]

    missing = client.get(f"{API}/me/collection", params={"status": "missing"}, headers=h).json()["items"]
    assert len(missing) == n - 2 and all(i["quantity"] == 0 for i in missing)

    lueur = client.get(f"{API}/me/collection", params={"status": "owned", "family": "LUEUR"}, headers=h).json()
    assert [i["creature"]["name"] for i in lueur["items"]] == ["Flammille"]
