from datetime import date, timedelta

from conftest import API, conclude_trade, give, not_first_booster, problem, register_and_login, set_weights

ADMIN_ROUTES = ("/admin/stats", "/admin/trades", "/admin/rarity-distribution", "/admin/settings/booster")


def test_player_is_denied_admin_access(client):
    """Preuve qualité 02 : un joueur se voit refuser l'accès administrateur."""
    h = register_and_login(client, "Lina")["headers"]
    for route in ADMIN_ROUTES:
        problem(client.get(f"{API}{route}", headers=h), 403, "FORBIDDEN")
        problem(client.get(f"{API}{route}"), 401, "UNAUTHENTICATED")
    problem(client.put(f"{API}/admin/settings/booster", json={"cardsPerBooster": 9}, headers=h), 403, "FORBIDDEN")


def test_admin_dashboard(client, admin_headers):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    client.post(f"{API}/me/boosters", headers=a["headers"])
    client.post(f"{API}/me/boosters", headers=b["headers"])
    give(a["id"], "Moussou", 1)
    give(b["id"], "Brumel", 1)
    t = conclude_trade(client, a, b, {"Moussou": 1}, {"Brumel": 1})

    stats = client.get(f"{API}/admin/stats", headers=admin_headers).json()
    today = date.fromisoformat(stats["period"]["to"])
    assert stats["period"]["from"] == (today - timedelta(days=29)).isoformat()  # 30 jours par défaut
    assert stats["registrations"] == {"total": 2, "inPeriod": 2}  # joueurs seulement, pas l'admin
    assert len(stats["boostersOpenedPerDay"]) == 30
    assert stats["boostersOpenedPerDay"][-1] == {"date": today.isoformat(), "count": 2}
    assert stats["completedTrades"]["inPeriod"] == 1
    assert stats["completedTrades"]["perDay"][-1] == {"date": today.isoformat(), "count": 1}
    assert sum(d["count"] for d in stats["completedTrades"]["perDay"]) == 1

    trades = client.get(f"{API}/admin/trades", params={"status": "ACCEPTED"}, headers=admin_headers).json()
    assert [x["id"] for x in trades["items"]] == [t["id"]] and trades["totalItems"] == 1
    assert client.get(f"{API}/admin/trades", params={"status": "REFUSED"}, headers=admin_headers).json()["items"] == []
    by_player = client.get(f"{API}/admin/trades", params={"playerId": str(a["id"])}, headers=admin_headers).json()
    assert [x["id"] for x in by_player["items"]] == [t["id"]]

    dist = client.get(f"{API}/admin/rarity-distribution", headers=admin_headers).json()
    assert dist["period"] == stats["period"]
    # 2 premiers boosters de 5 cartes : la rare garantie ne compte pas ; les cartes données non plus.
    assert dist["totalCardsDistributed"] == 8
    assert sum(i["observedCount"] for i in dist["items"]) == 8
    assert [i["rarity"]["code"] for i in dist["items"]] == ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"]
    assert abs(sum(i["observedRate"] for i in dist["items"]) - 1) < 0.001
    assert abs(sum(i["expectedRate"] for i in dist["items"]) - 1) < 0.001


def test_admin_period_validation(client, admin_headers):
    r = client.get(f"{API}/admin/stats", params={"from": "2026-03-03", "to": "2026-03-01"}, headers=admin_headers)
    problem(r, 400, "VALIDATION_ERROR")
    r = client.get(f"{API}/admin/stats", params={"from": "2025-01-01", "to": "2026-03-01"}, headers=admin_headers)
    problem(r, 400, "VALIDATION_ERROR")  # plus de 366 jours
    problem(client.get(f"{API}/admin/stats", params={"from": "hier"}, headers=admin_headers), 400, "VALIDATION_ERROR")
    stats = client.get(f"{API}/admin/stats", params={"from": "2026-03-01", "to": "2026-03-07"}, headers=admin_headers)
    assert [d["date"] for d in stats.json()["boostersOpenedPerDay"]][::6] == ["2026-03-01", "2026-03-07"]


def test_booster_settings(client, admin_headers):
    settings = client.get(f"{API}/admin/settings/booster", headers=admin_headers).json()
    assert settings == {
        "cardsPerBooster": 5,
        "rarityWeights": {"COMMON": 70, "UNCOMMON": 20, "RARE": 8, "LEGENDARY": 2},
        "updatedAt": None,
        "updatedBy": None,
    }

    r = client.put(f"{API}/admin/settings/booster", json={"cardsPerBooster": 7}, headers=admin_headers)
    assert r.status_code == 200
    updated = r.json()
    assert updated["cardsPerBooster"] == 7 and updated["updatedAt"] is not None
    assert updated["updatedBy"]["pseudo"] == "Admin"
    assert client.get(f"{API}/admin/settings/booster", headers=admin_headers).json() == updated

    for wrong in (0, 2, 11):  # de 3 à 10 cartes
        r = client.put(f"{API}/admin/settings/booster", json={"cardsPerBooster": wrong}, headers=admin_headers)
        problem(r, 400, "VALIDATION_ERROR")


def test_rarity_weights_settings(client, admin_headers):
    weights = {"COMMON": 60, "UNCOMMON": 25, "RARE": 10, "LEGENDARY": 5}
    r = client.put(
        f"{API}/admin/settings/booster", json={"cardsPerBooster": 5, "rarityWeights": weights}, headers=admin_headers
    )
    assert r.status_code == 200 and r.json()["rarityWeights"] == weights

    # Le taux affiché aux joueurs suit les nouveaux poids (calcul exact avec l'exclusion).
    rates = {x["code"]: x["dropRate"] for x in client.get(f"{API}/rarities", headers=admin_headers).json()}
    assert rates["LEGENDARY"] > 0.02 and abs(sum(rates.values()) - 1) < 0.001

    # Sans le nombre de cartes, ou avec des poids incomplets ou invalides : refusé, rien ne change.
    for body in (
        {"cardsPerBooster": 5, "rarityWeights": {"COMMON": 70, "UNCOMMON": 20, "RARE": 8}},
        {"cardsPerBooster": 5, "rarityWeights": {**weights, "RARE": -1}},
        {"cardsPerBooster": 5, "rarityWeights": {**weights, "RARE": 1001}},
        {"cardsPerBooster": 5, "rarityWeights": {"COMMON": 0, "UNCOMMON": 0, "RARE": 8, "LEGENDARY": 2}},
        {"cardsPerBooster": 5, "rarityWeights": {**weights, "EPIC": 1}},
    ):
        problem(client.put(f"{API}/admin/settings/booster", json=body, headers=admin_headers), 400, "VALIDATION_ERROR")
    assert client.get(f"{API}/admin/settings/booster", headers=admin_headers).json()["rarityWeights"] == weights


def test_boosters_per_day_counts_every_booster(client, admin_headers):
    """Correction : un joueur qui ouvre un booster trois jours de suite compte trois fois
    (avant l'historique, seul utilisateur.dernier_booster était connu)."""
    from sqlalchemy import text

    from app.database import SessionLocal

    p = register_and_login(client, "Lina")
    for days_ago in (2, 1, 0):
        not_first_booster(p["id"])  # booster d'hier : celui d'aujourd'hui est disponible
        booster_id = client.post(f"{API}/me/boosters", headers=p["headers"]).json()["id"]
        with SessionLocal() as db:  # date le booster de `days_ago` jours plus tôt
            db.execute(
                text("UPDATE booster_carte SET jour = jour - CAST(:d AS integer) WHERE booster_id = :b"),
                {"d": days_ago, "b": booster_id},
            )
            db.commit()
    per_day = client.get(f"{API}/admin/stats", headers=admin_headers).json()["boostersOpenedPerDay"]
    assert [d["count"] for d in per_day[-3:]] == [1, 1, 1]


def test_rarity_distribution_only_counts_the_period(client, admin_headers):
    set_weights(COMMUN=1, PEU_COMMUN=0, RARE=0, LEGENDAIRE=0)
    p = register_and_login(client, "Lina")
    not_first_booster(p["id"])
    client.post(f"{API}/me/boosters", headers=p["headers"])

    dist = client.get(f"{API}/admin/rarity-distribution", headers=admin_headers).json()
    observed = {i["rarity"]["code"]: (i["observedCount"], i["observedRate"]) for i in dist["items"]}
    assert observed["COMMON"] == (5, 1.0)
    expected = {i["rarity"]["code"]: i["expectedRate"] for i in dist["items"]}
    assert expected == {"COMMON": 1.0, "UNCOMMON": 0.0, "RARE": 0.0, "LEGENDARY": 0.0}

    old = client.get(
        f"{API}/admin/rarity-distribution", params={"from": "2026-01-01", "to": "2026-01-31"}, headers=admin_headers
    ).json()
    assert old["totalCardsDistributed"] == 0
