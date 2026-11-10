from conftest import API, creature_id, give, register_and_login


def test_player_is_denied_admin_access(client):
    """Preuve qualité 02 : un joueur se voit refuser l'accès administrateur."""
    h = register_and_login(client, "Lina")["headers"]
    for route in ("/admin/stats", "/admin/trades", "/admin/rarity-distribution"):
        assert client.get(f"{API}{route}", headers=h).status_code == 403
        assert client.get(f"{API}{route}").status_code == 401


def test_admin_dashboard(client, admin_headers):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    client.post(f"{API}/me/boosters", headers=a["headers"])
    client.post(f"{API}/me/boosters", headers=b["headers"])
    give(a["id"], "Moussou", 1)
    give(b["id"], "Brumel", 1)
    t = client.post(
        f"{API}/trades",
        json={
            "recipient_id": str(b["id"]),
            "offered": [{"creature_id": creature_id("Moussou")}],
            "requested": [{"creature_id": creature_id("Brumel")}],
        },
        headers=a["headers"],
    ).json()
    client.post(f"{API}/trades/{t['id']}/accept", headers=b["headers"])

    stats = client.get(f"{API}/admin/stats", headers=admin_headers).json()
    assert stats["users_total"] == 3 and stats["players_total"] == 2
    assert stats["boosters_today"] == 2
    assert stats["trades_accepted_in_period"] == 1 and stats["trades_pending"] == 0
    assert len(stats["daily"]) == 7
    assert stats["daily"][-1] == {"day": stats["period"]["date_to"], "trades_accepted": 1}

    trades = client.get(f"{API}/admin/trades", params={"status": "ACCEPTE"}, headers=admin_headers).json()
    assert [x["id"] for x in trades] == [t["id"]]
    assert client.get(f"{API}/admin/trades", params={"status": "REFUSE"}, headers=admin_headers).json() == []
    by_player = client.get(f"{API}/admin/trades", params={"player_id": str(a["id"])}, headers=admin_headers)
    assert [x["id"] for x in by_player.json()] == [t["id"]]

    dist = client.get(f"{API}/admin/rarity-distribution", headers=admin_headers).json()
    assert dist["cards_drawn"] == 12  # 2 boosters de 5 + 2 cartes données
    assert sum(i["cards_drawn"] for i in dist["items"]) == 12
    assert [i["rarity"] for i in dist["items"]] == ["COMMUN", "PEU_COMMUN", "RARE"]

    bad = client.get(f"{API}/admin/stats", params={"from": "2026-03-03", "to": "2026-03-01"}, headers=admin_headers)
    assert bad.status_code == 400
