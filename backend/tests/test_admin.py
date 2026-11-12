from datetime import date, timedelta

from conftest import API, creature_id, give, problem, register_and_login

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
    t = client.post(
        f"{API}/trades",
        json={
            "recipientId": str(b["id"]),
            "offered": [{"creatureId": creature_id("Moussou"), "quantity": 1}],
            "requested": [{"creatureId": creature_id("Brumel"), "quantity": 1}],
        },
        headers=a["headers"],
    ).json()
    client.post(f"{API}/trades/{t['id']}/accept", headers=b["headers"])

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
    assert dist["totalCardsDistributed"] == 12  # 2 boosters de 5 + 2 cartes données
    assert sum(i["observedCount"] for i in dist["items"]) == 12
    assert [i["rarity"]["code"] for i in dist["items"]] == ["COMMON", "UNCOMMON", "RARE"]
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
    assert settings == {"cardsPerBooster": 5, "updatedAt": None, "updatedBy": None}

    r = client.put(f"{API}/admin/settings/booster", json={"cardsPerBooster": 7}, headers=admin_headers)
    assert r.status_code == 200
    updated = r.json()
    assert updated["cardsPerBooster"] == 7 and updated["updatedAt"] is not None
    assert updated["updatedBy"]["pseudo"] == "Admin"
    assert client.get(f"{API}/admin/settings/booster", headers=admin_headers).json() == updated

    for wrong in (0, 11):
        r = client.put(f"{API}/admin/settings/booster", json={"cardsPerBooster": wrong}, headers=admin_headers)
        problem(r, 400, "VALIDATION_ERROR")
