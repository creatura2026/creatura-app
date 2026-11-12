from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from conftest import API, assert_stock_invariant, creature_id, give, problem, quantity, register_and_login

from app.controllers import trade as trade_controller
from app.database import SessionLocal
from app.errors import Conflict
from app.models import Utilisateur


def propose(client, proposer, recipient, offered: dict[str, int], requested: dict[str, int]):
    def items(cards):
        return [{"creatureId": creature_id(n), "quantity": q} for n, q in cards.items()]

    return client.post(
        f"{API}/trades",
        json={"recipientId": str(recipient["id"]), "offered": items(offered), "requested": items(requested)},
        headers=proposer["headers"],
    )


def ids(page: dict) -> list[str]:
    return [t["id"] for t in page["items"]]


def test_accepted_trade_moves_cards(client):
    """Exemple du cahier des charges : A (Moussou ×2) ⇄ B (Brumel)."""
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 2)
    give(b["id"], "Brumel", 2)

    # UC-08 : A trouve B et voit ses doublons (un exemplaire reste toujours à B).
    players = client.get(f"{API}/players", params={"search": "bo"}, headers=a["headers"]).json()
    assert players["items"] == [{"id": str(b["id"]), "pseudo": "Bob"}] and players["totalItems"] == 1
    cards = client.get(f"{API}/players/{b['id']}/tradeable-cards", headers=a["headers"]).json()
    assert cards["player"]["pseudo"] == "Bob"
    assert [(c["creature"]["name"], c["availableQuantity"]) for c in cards["items"]] == [("Brumel", 1)]

    r = propose(client, a, b, {"Moussou": 1}, {"Brumel": 1})
    assert r.status_code == 201, r.text
    trade = r.json()
    assert trade["status"] == "PENDING" and trade["decidedAt"] is None and trade["failureReason"] is None
    assert trade["proposer"] == {"id": str(a["id"]), "pseudo": "Alice"}
    assert [(i["creature"]["name"], i["quantity"]) for i in trade["offered"]] == [("Moussou", 1)]

    # Le proposant ne peut pas accepter sa propre proposition.
    problem(client.post(f"{API}/trades/{trade['id']}/accept", headers=a["headers"]), 403, "FORBIDDEN")

    r = client.post(f"{API}/trades/{trade['id']}/accept", headers=b["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ACCEPTED" and r.json()["decidedAt"] is not None

    assert (quantity(a["id"], "Moussou"), quantity(a["id"], "Brumel")) == (1, 1)
    assert (quantity(b["id"], "Moussou"), quantity(b["id"], "Brumel")) == (1, 1)
    assert_stock_invariant()  # les échanges ne touchent pas au stock

    problem(client.post(f"{API}/trades/{trade['id']}/accept", headers=b["headers"]), 409, "TRADE_NOT_PENDING")

    # UC-11 : historique des deux côtés.
    assert ids(client.get(f"{API}/trades", headers=a["headers"]).json()) == [trade["id"]]
    received = client.get(f"{API}/trades", params={"role": "received"}, headers=b["headers"]).json()
    assert ids(received) == [trade["id"]]
    assert ids(client.get(f"{API}/trades", params={"role": "sent"}, headers=b["headers"]).json()) == []
    accepted = client.get(f"{API}/trades", params={"status": "ACCEPTED"}, headers=a["headers"]).json()
    assert ids(accepted) == [trade["id"]]


def test_trade_with_several_cards_each_side(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 3)
    give(a["id"], "Flammille", 1)
    give(b["id"], "Brumel", 1)
    give(b["id"], "Galetin", 2)

    t = propose(client, a, b, {"Moussou": 2, "Flammille": 1}, {"Brumel": 1, "Galetin": 2}).json()
    assert client.post(f"{API}/trades/{t['id']}/accept", headers=b["headers"]).status_code == 200

    assert [quantity(a["id"], n) for n in ("Moussou", "Flammille", "Brumel", "Galetin")] == [1, 0, 1, 2]
    assert [quantity(b["id"], n) for n in ("Moussou", "Flammille", "Brumel", "Galetin")] == [2, 1, 0, 0]
    assert_stock_invariant()


def test_refused_and_cancelled_trades_move_nothing(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 1)
    give(b["id"], "Brumel", 1)

    t1 = propose(client, a, b, {"Moussou": 1}, {"Brumel": 1}).json()
    assert client.post(f"{API}/trades/{t1['id']}/refuse", headers=b["headers"]).json()["status"] == "REFUSED"

    t2 = propose(client, a, b, {"Moussou": 1}, {"Brumel": 1}).json()
    problem(client.post(f"{API}/trades/{t2['id']}/cancel", headers=b["headers"]), 403, "FORBIDDEN")
    assert client.post(f"{API}/trades/{t2['id']}/cancel", headers=a["headers"]).json()["status"] == "CANCELLED"
    problem(client.post(f"{API}/trades/{t2['id']}/accept", headers=b["headers"]), 409, "TRADE_NOT_PENDING")

    assert quantity(a["id"], "Moussou") == 1 and quantity(b["id"], "Brumel") == 1


def test_trade_validation(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 1)
    give(b["id"], "Brumel", 1)

    problem(propose(client, a, b, {"Moussou": 2}, {"Brumel": 1}), 422, "CARDS_NOT_OWNED")  # A n'en a qu'un
    problem(propose(client, a, b, {"Moussou": 1}, {"Cristille": 1}), 422, "CARDS_NOT_OWNED")  # B n'a pas Cristille
    problem(propose(client, a, a, {"Moussou": 1}, {"Brumel": 1}), 422, "TRADE_WITH_SELF")
    problem(propose(client, a, b, {"Moussou": 1}, {"Moussou": 1}), 400, "VALIDATION_ERROR")  # des deux côtés
    problem(propose(client, a, b, {"Moussou": 11}, {"Brumel": 1}), 400, "VALIDATION_ERROR")  # 10 au maximum
    body = problem(propose(client, a, b, {"Moussou": 1}, {}), 400, "VALIDATION_ERROR")
    assert body["errors"] == [{"field": "requested", "message": "1 élément(s) au minimum"}]

    def raw(offered_id, **extra):
        payload = {"recipientId": str(b["id"]), "offered": [{"creatureId": offered_id, "quantity": 1}],
                   "requested": [{"creatureId": creature_id("Brumel"), "quantity": 1}], **extra}  # fmt: skip
        return client.post(f"{API}/trades", json=payload, headers=a["headers"])

    problem(raw("9999"), 404, "NOT_FOUND")
    problem(raw("abc"), 404, "NOT_FOUND")
    problem(raw(creature_id("Moussou"), message="salut"), 400, "VALIDATION_ERROR")  # champ inconnu
    stranger = {"id": "00000000-0000-0000-0000-000000000000"}
    problem(propose(client, a, stranger, {"Moussou": 1}, {"Brumel": 1}), 404, "NOT_FOUND")
    problem(client.get(f"{API}/trades/pas-un-uuid", headers=a["headers"]), 400, "VALIDATION_ERROR")


def test_trade_visible_only_to_its_players(client):
    a, b, c = (register_and_login(client, n) for n in ("Alice", "Bob", "Chloe"))
    give(a["id"], "Moussou", 1)
    give(b["id"], "Brumel", 1)
    t = propose(client, a, b, {"Moussou": 1}, {"Brumel": 1}).json()

    assert client.get(f"{API}/trades/{t['id']}", headers=b["headers"]).json()["id"] == t["id"]
    problem(client.get(f"{API}/trades/{t['id']}", headers=c["headers"]), 403, "FORBIDDEN")
    problem(client.get(f"{API}/trades/00000000-0000-0000-0000-000000000000", headers=c["headers"]), 404, "NOT_FOUND")


def test_card_no_longer_available_at_acceptance(client):
    a, b, c = (register_and_login(client, n) for n in ("Alice", "Bob", "Chloe"))
    give(a["id"], "Moussou", 1)
    give(b["id"], "Brumel", 1)
    give(c["id"], "Cristille", 1)

    t_b = propose(client, a, b, {"Moussou": 1}, {"Brumel": 1}).json()
    t_c = propose(client, a, c, {"Moussou": 1}, {"Cristille": 1}).json()

    assert client.post(f"{API}/trades/{t_b['id']}/accept", headers=b["headers"]).status_code == 200
    body = problem(client.post(f"{API}/trades/{t_c['id']}/accept", headers=c["headers"]), 409, "CARDS_UNAVAILABLE")
    assert body["detail"] == "Moussou n'est plus disponible chez Alice. Aucune carte n'a été transférée."

    # Aucun transfert partiel : C garde sa carte, et l'échange passe en échec.
    assert quantity(c["id"], "Cristille") == 1 and quantity(c["id"], "Moussou") == 0
    failed = client.get(f"{API}/trades/{t_c['id']}", headers=c["headers"]).json()
    assert failed["status"] == "FAILED" and failed["failureReason"] == "CARDS_UNAVAILABLE"
    assert failed["decidedAt"] is not None
    problem(client.post(f"{API}/trades/{t_c['id']}/accept", headers=c["headers"]), 409, "TRADE_NOT_PENDING")
    assert ids(client.get(f"{API}/trades", params={"status": "FAILED"}, headers=a["headers"]).json()) == [t_c["id"]]
    assert_stock_invariant()


def test_concurrent_acceptances_do_not_consume_same_copy(client):
    """Preuve qualité 03 : deux échanges concurrents ne consomment pas le même exemplaire."""
    a = register_and_login(client, "Alice")
    give(a["id"], "Moussou", 1)  # un seul exemplaire, proposé à 5 joueurs
    others = []
    for name, card in [("Bob", "Brumel"), ("Chloe", "Cristille"), ("Dan", "Nuageon"),
                       ("Eve", "Solaris"), ("Fred", "Lucioli")]:  # fmt: skip
        p = register_and_login(client, name)
        give(p["id"], card, 1)
        others.append((p, card, propose(client, a, p, {"Moussou": 1}, {card: 1}).json()["id"]))

    barrier = Barrier(len(others))

    def accept(entry):
        player, _, trade_id = entry
        with SessionLocal() as db:
            me = db.get(Utilisateur, player["id"])
            barrier.wait()
            try:
                trade_controller.accept_trade(db, me, trade_id)
                return "ok"
            except Conflict:
                return "conflict"

    with ThreadPoolExecutor(len(others)) as pool:
        results = list(pool.map(accept, others))

    assert results.count("ok") == 1
    assert quantity(a["id"], "Moussou") == 0
    assert sum(quantity(p["id"], "Moussou") for p, _, _ in others) == 1
    # Seul le gagnant a donné sa carte ; les autres l'ont conservée et leur échange a échoué.
    assert sum(quantity(p["id"], card) for p, card, _ in others) == len(others) - 1
    statuses = sorted(t["status"] for t in client.get(f"{API}/trades", headers=a["headers"]).json()["items"])
    assert statuses == ["ACCEPTED"] + ["FAILED"] * (len(others) - 1)
    assert_stock_invariant()
