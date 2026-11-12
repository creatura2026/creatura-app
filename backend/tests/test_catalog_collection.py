"""Catalogue et collection. Le catalogue vient de db/init/02_catalogue.sql : les tests ne
dépendent pas de sa taille, seulement de quelques créatures connues (Moussou, Brumel…)."""

from math import ceil

from conftest import API, SessionLocal, catalogue_size, creature_id, give, problem, register_and_login, set_stock
from sqlalchemy import select

from app.models import Creature

FAMILIES = ["NATURE", "CRISTAL", "BRUME", "LUEUR"]
RARITIES = ["COMMON", "UNCOMMON", "RARE"]


def names(page: dict) -> list[str]:
    return [item.get("name") or item["creature"]["name"] for item in page["items"]]


def all_creatures(client, headers, **params) -> dict:
    return client.get(f"{API}/creatures", params={"pageSize": 100, **params}, headers=headers).json()


def test_catalog_page_and_creature_format(client):
    h = register_and_login(client, "Lina")["headers"]
    n = catalogue_size()
    page = client.get(f"{API}/creatures", headers=h).json()
    assert {k: page[k] for k in ("page", "pageSize", "totalItems", "totalPages")} == {
        "page": 1, "pageSize": 20, "totalItems": n, "totalPages": ceil(n / 20),
    }  # fmt: skip
    assert len(page["items"]) == min(n, 20)

    everything = all_creatures(client, h)["items"]
    # Ordre d'affichage : famille, puis rareté (de la plus commune à la plus rare).
    order = [(FAMILIES.index(c["family"]["code"]), RARITIES.index(c["rarity"]["code"])) for c in everything]
    assert order == sorted(order)

    moussou = next(c for c in everything if c["name"] == "Moussou")
    assert moussou == {
        "id": creature_id("Moussou"),
        "name": "Moussou",
        "description": moussou["description"],
        "family": {"code": "NATURE", "label": "Nature"},
        "rarity": {"code": "COMMON", "label": "Commun"},
        "imageUrl": "https://cdn.test/sprites/moss_puff.png",
    }
    assert "mousse" in moussou["description"]

    page3 = client.get(f"{API}/creatures", params={"page": 3, "pageSize": 5}, headers=h).json()
    assert names(page3) == [c["name"] for c in everything[10:15]] and page3["totalPages"] == ceil(n / 5)
    assert client.get(f"{API}/creatures", params={"page": 99}, headers=h).json()["items"] == []
    problem(client.get(f"{API}/creatures", params={"pageSize": 101}, headers=h), 400, "VALIDATION_ERROR")

    brumel = client.get(f"{API}/creatures/{creature_id('Brumel')}", headers=h).json()
    assert brumel["name"] == "Brumel" and brumel["rarity"]["code"] == "RARE"
    problem(client.get(f"{API}/creatures/999999", headers=h), 404, "NOT_FOUND")
    problem(client.get(f"{API}/creatures/pas-un-nombre", headers=h), 404, "NOT_FOUND")


def test_catalog_search_and_filters(client):
    h = register_and_login(client, "Lina")["headers"]

    def search(**params):
        return names(all_creatures(client, h, **params))

    assert search(search="mous") == ["Moussou"]
    assert search(search="MOÛS") == ["Moussou"]  # sans casse ni accents
    assert "Améthor" in search(search="amethor")  # accents de la base ignorés aussi
    assert search(search="%") == []  # caractère spécial de LIKE : cherché tel quel

    nature = all_creatures(client, h, family="NATURE")["items"]
    assert "Moussou" in names({"items": nature}) and {c["family"]["code"] for c in nature} == {"NATURE"}
    assert "Brumel" in search(family="BRUME", rarity="RARE")
    uncommon = all_creatures(client, h, rarity="UNCOMMON")["items"]
    assert uncommon and {c["rarity"]["code"] for c in uncommon} == {"UNCOMMON"}
    problem(client.get(f"{API}/creatures", params={"family": "ONDE"}, headers=h), 400, "VALIDATION_ERROR")
    problem(client.get(f"{API}/creatures", params={"rarity": "COMMUN"}, headers=h), 400, "VALIDATION_ERROR")


def test_families_and_rarities(client):
    h = register_and_login(client, "Lina")["headers"]
    families = client.get(f"{API}/families", headers=h).json()
    assert families == [
        {"code": "NATURE", "label": "Nature"},
        {"code": "CRISTAL", "label": "Cristal"},
        {"code": "BRUME", "label": "Brume"},
        {"code": "LUEUR", "label": "Lueur"},
    ]
    rarities = client.get(f"{API}/rarities", headers=h).json()
    assert [(r["code"], r["label"], r["rank"]) for r in rarities] == [
        ("COMMON", "Commun", 1), ("UNCOMMON", "Peu commun", 2), ("RARE", "Rare", 3),
    ]  # fmt: skip
    assert abs(sum(r["dropRate"] for r in rarities) - 1) < 0.001


def test_draw_probabilities_follow_weights_and_stock(client):
    h = register_and_login(client, "Lina")["headers"]
    with SessionLocal() as db:
        poids = dict(db.execute(select(Creature.nom, Creature.poids)).all())
    set_stock({"Moussou": 10, "Brumel": 10})  # toutes les autres créatures sont épuisées
    rates = {r["code"]: r["dropRate"] for r in client.get(f"{API}/rarities", headers=h).json()}
    total = poids["Moussou"] + poids["Brumel"]
    assert rates == {
        "COMMON": round(poids["Moussou"] / total, 4),
        "UNCOMMON": 0.0,
        "RARE": round(poids["Brumel"] / total, 4),
    }


def test_collection_filters_and_progress(client):
    p = register_and_login(client, "Lina")
    give(p["id"], "Moussou", 3)
    give(p["id"], "Flammille", 1)
    h = p["headers"]
    n = catalogue_size()

    def collection(**params):
        return client.get(f"{API}/me/collection", params={"pageSize": 100, **params}, headers=h).json()

    page = collection()
    catalog = names(all_creatures(client, h))
    assert page["totalItems"] == n and names(page) == catalog  # même ordre que le catalogue
    assert set(page["items"][0]) == {"creature", "quantity"}
    assert set(page["items"][0]["creature"]) == {"id", "name", "family", "rarity", "imageUrl"}
    assert page["progress"] == {
        "ownedCreatures": 2,
        "totalCreatures": n,
        "totalCards": 4,
        "completionPercent": round(2 * 100 / n, 1),
    }

    owned = collection(ownership="owned")["items"]
    assert [(e["creature"]["name"], e["quantity"]) for e in owned] == [("Moussou", 3), ("Flammille", 1)]

    dups = collection(duplicatesOnly="true")["items"]
    assert [e["creature"]["name"] for e in dups] == ["Moussou"]

    missing = collection(ownership="missing")
    assert missing["totalItems"] == n - 2 and all(e["quantity"] == 0 for e in missing["items"])
    assert missing["progress"]["ownedCreatures"] == 2  # la progression ignore les filtres

    lueur = collection(ownership="owned", family="LUEUR")
    assert [e["creature"]["name"] for e in lueur["items"]] == ["Flammille"]

    second = collection(page=2, pageSize=5)
    assert names(second) == catalog[5:10]
