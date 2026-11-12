from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from conftest import API, assert_stock_invariant, creature_id, give, quantity, register_and_login

from app.controllers import trade as trade_controller
from app.database import SessionLocal
from app.errors import Conflict
from app.models import Utilisateur


def propose(client, proposer, recipient, offered: dict[str, int], requested: dict[str, int]):
    def lines(cards):
        return [{"creature_id": creature_id(n), "quantity": q} for n, q in cards.items()]

    return client.post(
        f"{API}/trades",
        json={"recipient_id": str(recipient["id"]), "offered": lines(offered), "requested": lines(requested)},
        headers=proposer["headers"],
    )


def test_accepted_trade_moves_cards(client):
    """Exemple du cahier des charges : A (Moussou ×2) ⇄ B (Brumel ×1)."""
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 2)
    give(b["id"], "Brumel", 1)

    # UC-08 : A explore les cartes de B.
    players = client.get(f"{API}/players", params={"search": "bo"}, headers=a["headers"]).json()
    assert [p["pseudo"] for p in players] == ["Bob"]
    cards = client.get(f"{API}/players/{b['id']}/tradeable-cards", headers=a["headers"]).json()
    assert [(c["creature"]["name"], c["quantity"]) for c in cards["cards"]] == [("Brumel", 1)]

    r = propose(client, a, b, {"Moussou": 1}, {"Brumel": 1})
    assert r.status_code == 201, r.text
    trade = r.json()
    assert trade["status"] == "EN_ATTENTE" and trade["decided_at"] is None
    assert [(l["creature"]["name"], l["quantity"]) for l in trade["offered"]] == [("Moussou", 1)]

    # Le proposeur ne peut pas accepter sa propre proposition.
    assert client.post(f"{API}/trades/{trade['id']}/accept", headers=a["headers"]).status_code == 403

    r = client.post(f"{API}/trades/{trade['id']}/accept", headers=b["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ACCEPTE" and r.json()["decided_at"] is not None

    assert (quantity(a["id"], "Moussou"), quantity(a["id"], "Brumel")) == (1, 1)
    assert (quantity(b["id"], "Moussou"), quantity(b["id"], "Brumel")) == (1, 0)
    assert_stock_invariant()  # les échanges ne touchent pas au stock

    # Déjà traité.
    assert client.post(f"{API}/trades/{trade['id']}/accept", headers=b["headers"]).status_code == 409

    # UC-11 : historique des deux côtés.
    assert [t["id"] for t in client.get(f"{API}/trades", headers=a["headers"]).json()] == [trade["id"]]
    received = client.get(f"{API}/trades", params={"role": "received"}, headers=b["headers"]).json()
    assert [t["id"] for t in received] == [trade["id"]]


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
    assert client.post(f"{API}/trades/{t1['id']}/refuse", headers=b["headers"]).json()["status"] == "REFUSE"

    t2 = propose(client, a, b, {"Moussou": 1}, {"Brumel": 1}).json()
    assert client.post(f"{API}/trades/{t2['id']}/cancel", headers=b["headers"]).status_code == 403
    assert client.post(f"{API}/trades/{t2['id']}/cancel", headers=a["headers"]).json()["status"] == "ANNULE"
    assert client.post(f"{API}/trades/{t2['id']}/accept", headers=b["headers"]).status_code == 409

    assert quantity(a["id"], "Moussou") == 1 and quantity(b["id"], "Brumel") == 1


def test_trade_validation(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 1)
    give(b["id"], "Brumel", 1)

    assert propose(client, a, b, {"Moussou": 2}, {"Brumel": 1}).status_code == 409  # A n'en a qu'un
    assert propose(client, a, b, {"Moussou": 1}, {"Cristille": 1}).status_code == 409  # B n'a pas Cristille
    assert propose(client, a, a, {"Moussou": 1}, {"Brumel": 1}).status_code == 400  # soi-même
    assert propose(client, a, b, {"Moussou": 1}, {"Moussou": 1}).status_code == 400  # même carte des deux côtés
    assert propose(client, a, b, {"Moussou": 1}, {}).status_code == 422  # au moins une carte demandée
    r = client.post(
        f"{API}/trades",
        json={"recipient_id": str(b["id"]), "offered": [{"creature_id": 9999}], "requested": [{"creature_id": 1}]},
        headers=a["headers"],
    )
    assert r.status_code == 404
    assert client.get(f"{API}/trades/pas-un-uuid", headers=a["headers"]).status_code == 422


def test_card_no_longer_available_at_acceptance(client):
    a, b, c = (register_and_login(client, n) for n in ("Alice", "Bob", "Chloe"))
    give(a["id"], "Moussou", 1)
    give(b["id"], "Brumel", 1)
    give(c["id"], "Cristille", 1)

    t_b = propose(client, a, b, {"Moussou": 1}, {"Brumel": 1}).json()
    t_c = propose(client, a, c, {"Moussou": 1}, {"Cristille": 1}).json()

    assert client.post(f"{API}/trades/{t_b['id']}/accept", headers=b["headers"]).status_code == 200
    r = client.post(f"{API}/trades/{t_c['id']}/accept", headers=c["headers"])
    assert r.status_code == 409
    # Aucun transfert partiel : C garde sa carte, l'échange reste en attente.
    assert quantity(c["id"], "Cristille") == 1 and quantity(c["id"], "Moussou") == 0
    assert client.get(f"{API}/trades/{t_c['id']}", headers=c["headers"]).json()["status"] == "EN_ATTENTE"
    assert_stock_invariant()


def test_concurrent_acceptances_do_not_consume_same_copy(client):
    """Preuve qualité 03 : deux échanges concurrents ne consomment pas le même exemplaire."""
    a = register_and_login(client, "Alice")
    give(a["id"], "Moussou", 1)  # un seul exemplaire, proposé à 5 joueurs
    others = []
    for name, card in [("Bob", "Brumel"), ("Chloe", "Cristille"), ("Dan", "Nuageon"),
                       ("Eve", "Solaris"), ("Fred", "Lucioli")]:
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
    # Seul le gagnant a donné sa carte ; les autres l'ont conservée.
    assert sum(quantity(p["id"], card) for p, card, _ in others) == len(others) - 1
    assert_stock_invariant()
