"""Salle d'échange (UC-09, UC-10, UC-11) : ouverture, tapis, validations croisées, discussion."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from conftest import (
    API,
    assert_stock_invariant,
    cards,
    conclude_trade,
    creature_id,
    give,
    live,
    mat,
    open_trade,
    problem,
    quantity,
    register_and_login,
)
from starlette.testclient import WebSocketDenialResponse

from app.controllers import trade as trade_controller
from app.database import SessionLocal
from app.models import Utilisateur
from app.schemas.trade import TradeItemIn


def ids(page: dict) -> list[str]:
    return [t["id"] for t in page["items"]]


def test_trade_room_concludes_when_both_validate(client):
    """Exemple du cahier des charges : A (Moussou ×2) ⇄ B (Brumel)."""
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 2)
    give(b["id"], "Brumel", 1)

    # UC-08 : A trouve B et voit toutes ses cartes, dernier exemplaire compris.
    players = client.get(f"{API}/players", params={"search": "bo"}, headers=a["headers"]).json()
    assert players["items"] == [{"id": str(b["id"]), "pseudo": "Bob"}]
    tradeable = client.get(f"{API}/players/{b['id']}/tradeable-cards", headers=a["headers"]).json()
    assert [(c["creature"]["name"], c["availableQuantity"]) for c in tradeable["items"]] == [("Brumel", 1)]

    r = client.post(
        f"{API}/trades",
        json={"recipientId": str(b["id"]), "wantedCreatureId": creature_id("Brumel")},
        headers=a["headers"],
    )
    assert r.status_code == 201, r.text
    trade = r.json()
    assert trade["status"] == "PENDING" and trade["offered"] == [] and trade["requested"] == []
    assert trade["proposerReady"] is False and trade["recipientReady"] is False
    assert trade["wanted"]["name"] == "Brumel" and trade["decidedAt"] is None

    with live(client, a, trade["id"]) as room_a:
        assert room_a.init["online"] == [str(a["id"])] and room_a.init["messages"] == []
        with live(client, b, trade["id"]) as room_b:
            assert sorted(room_b.init["online"]) == sorted([str(a["id"]), str(b["id"])])
            assert room_a.next("presence") == {"type": "presence", "playerId": str(b["id"]), "online": True}

            # Discussion : le message arrive aux deux joueurs.
            room_a.send(type="chat", text="  Salut, ton Brumel contre mon Moussou ?  ")
            said = room_b.next("chat")["message"]
            assert said["text"] == "Salut, ton Brumel contre mon Moussou ?" and said["author"]["pseudo"] == "Alice"
            assert room_a.next("chat")["message"] == said

            assert mat(room_a.offer({"Moussou": 1})["offered"]) == [("Moussou", 1)]
            assert mat(room_b.trade["offered"]) == [("Moussou", 1)]  # B voit le tapis de A

            # Pas de validation tant qu'un tapis est vide.
            room_a.send(type="ready", ready=True)
            assert room_a.error()["code"] == "VALIDATION_ERROR"

            room_b.offer({"Brumel": 1})
            assert room_a.ready()["proposerReady"] is True
            # Modifier son tapis retire les deux validations (on ne valide que ce que l'on voit).
            room_b.offer({"Brumel": 1})
            assert room_b.trade["proposerReady"] is False
            # Un joueur qui a validé ne peut plus changer son tapis.
            room_a.ready()
            room_a.send(type="offer", items=cards({"Moussou": 2}))
            assert room_a.error()["code"] == "VALIDATION_ERROR"

            done = room_b.ready()
            assert done["status"] == "ACCEPTED" and done["decidedAt"] is not None
            assert room_a.trade["status"] == "ACCEPTED"

            room_a.send(type="chat", text="Merci !")
            assert room_a.error()["code"] == "TRADE_NOT_PENDING"
        assert room_a.next("presence") == {"type": "presence", "playerId": str(b["id"]), "online": False}

    assert (quantity(a["id"], "Moussou"), quantity(a["id"], "Brumel")) == (1, 1)
    assert (quantity(b["id"], "Moussou"), quantity(b["id"], "Brumel")) == (1, 0)
    assert_stock_invariant()  # les échanges ne touchent pas au stock

    # UC-11 : historique des deux côtés, avec la discussion conservée.
    assert ids(client.get(f"{API}/trades", headers=a["headers"]).json()) == [trade["id"]]
    assert ids(client.get(f"{API}/trades", params={"role": "received"}, headers=b["headers"]).json()) == [trade["id"]]
    assert ids(client.get(f"{API}/trades", params={"role": "sent"}, headers=b["headers"]).json()) == []
    with live(client, b, trade["id"]) as again:
        assert [m["text"] for m in again.init["messages"]] == ["Salut, ton Brumel contre mon Moussou ?"]


def test_trade_with_several_cards_each_side(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 3)
    give(a["id"], "Flammille", 1)
    give(b["id"], "Brumel", 1)
    give(b["id"], "Galetin", 2)

    conclude_trade(client, a, b, {"Moussou": 2, "Flammille": 1}, {"Brumel": 1, "Galetin": 2})

    assert [quantity(a["id"], n) for n in ("Moussou", "Flammille", "Brumel", "Galetin")] == [1, 0, 1, 2]
    assert [quantity(b["id"], n) for n in ("Moussou", "Flammille", "Brumel", "Galetin")] == [2, 1, 0, 0]
    assert_stock_invariant()


def test_same_creature_on_both_mats(client):
    """Chacun peut donner la même créature : seules les quantités comptent."""
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 1)
    give(b["id"], "Moussou", 2)
    conclude_trade(client, a, b, {"Moussou": 1}, {"Moussou": 2})
    assert (quantity(a["id"], "Moussou"), quantity(b["id"], "Moussou")) == (2, 1)
    assert_stock_invariant()


def test_one_open_trade_between_two_players(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    first = open_trade(client, a, b)

    # B ouvre à son tour : il retrouve la même salle (200), pas une seconde.
    r = client.post(f"{API}/trades", json={"recipientId": str(a["id"])}, headers=b["headers"])
    assert r.status_code == 200 and r.json()["id"] == first["id"]
    # A précise la carte qu'il cherche : la salle existante est mise à jour.
    again = open_trade(client, a, b, wanted="Brumel")
    assert again["id"] == first["id"] and again["wanted"]["name"] == "Brumel"

    # Une fois la salle fermée, un nouvel échange peut s'ouvrir.
    client.post(f"{API}/trades/{first['id']}/cancel", headers=a["headers"])
    assert open_trade(client, a, b)["id"] != first["id"]


def test_refused_and_cancelled_trades_close_the_room(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 1)

    t1 = open_trade(client, a, b)
    with live(client, a, t1["id"]) as room_a:
        room_a.offer({"Moussou": 1})
        problem(client.post(f"{API}/trades/{t1['id']}/refuse", headers=a["headers"]), 403, "FORBIDDEN")
        assert client.post(f"{API}/trades/{t1['id']}/refuse", headers=b["headers"]).json()["status"] == "REFUSED"
        # La salle est prévenue, et plus rien n'y est possible.
        assert room_a.next("trade")["trade"]["status"] == "REFUSED"
        room_a.send(type="offer", items=[])
        assert room_a.error()["code"] == "TRADE_NOT_PENDING"

    t2 = open_trade(client, a, b)
    problem(client.post(f"{API}/trades/{t2['id']}/cancel", headers=b["headers"]), 403, "FORBIDDEN")
    assert client.post(f"{API}/trades/{t2['id']}/cancel", headers=a["headers"]).json()["status"] == "CANCELLED"
    problem(client.post(f"{API}/trades/{t2['id']}/cancel", headers=a["headers"]), 409, "TRADE_NOT_PENDING")

    assert quantity(a["id"], "Moussou") == 1


def test_trade_validation(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 1)

    problem(client.post(f"{API}/trades", json={"recipientId": str(a["id"])}, headers=a["headers"]), 422, "TRADE_WITH_SELF")
    stranger = {"recipientId": "00000000-0000-0000-0000-000000000000"}
    problem(client.post(f"{API}/trades", json=stranger, headers=a["headers"]), 404, "NOT_FOUND")
    unknown = {"recipientId": str(b["id"]), "wantedCreatureId": "9999"}
    problem(client.post(f"{API}/trades", json=unknown, headers=a["headers"]), 404, "NOT_FOUND")
    extra = {"recipientId": str(b["id"]), "offered": []}  # ancien format : champ inconnu
    problem(client.post(f"{API}/trades", json=extra, headers=a["headers"]), 400, "VALIDATION_ERROR")
    problem(client.get(f"{API}/trades/pas-un-uuid", headers=a["headers"]), 400, "VALIDATION_ERROR")

    trade = open_trade(client, a, b)
    with live(client, a, trade["id"]) as room:
        room.send(type="offer", items=cards({"Moussou": 2}))  # A n'en a qu'un
        assert room.error()["code"] == "CARDS_NOT_OWNED"
        room.send(type="offer", items=[{"creatureId": "9999", "quantity": 1}])
        assert room.error()["code"] == "NOT_FOUND"
        room.send(type="offer", items=cards({"Moussou": 11}))  # 10 au maximum par ligne
        error = room.error()
        assert error["code"] == "VALIDATION_ERROR" and error["errors"][0]["field"] == "offer.items[0].quantity"
        room.send(type="dance")
        assert room.error()["code"] == "VALIDATION_ERROR"
        room.ws.send_text("pas du JSON")
        assert room.error()["code"] == "VALIDATION_ERROR"
        room.send(type="chat", text="   ")
        assert room.error()["code"] == "VALIDATION_ERROR"
        # La salle reste utilisable après une erreur.
        assert mat(room.offer({"Moussou": 1})["offered"]) == [("Moussou", 1)]
        assert room.offer({})["offered"] == []


def test_trade_room_access(client):
    a, b, c = (register_and_login(client, n) for n in ("Alice", "Bob", "Chloe"))
    t = open_trade(client, a, b)

    assert client.get(f"{API}/trades/{t['id']}", headers=b["headers"]).json()["id"] == t["id"]
    problem(client.get(f"{API}/trades/{t['id']}", headers=c["headers"]), 403, "FORBIDDEN")

    def denied(url: str) -> int:
        with pytest.raises(WebSocketDenialResponse) as denial:
            with client.websocket_connect(url):
                pass
        return denial.value.status_code

    url = f"{API}/trades/{t['id']}/live"
    assert denied(f"{url}?access_token={c['tokens']['accessToken']}") == 403
    assert denied(f"{url}?access_token=faux") == 401
    assert denied(url) == 401
    assert denied(f"{API}/trades/00000000-0000-0000-0000-000000000000/live?access_token={a['tokens']['accessToken']}") == 404
    assert denied(f"{API}/trades/pas-un-uuid/live?access_token={a['tokens']['accessToken']}") == 404
    # Le jeton de renouvellement n'ouvre pas la salle.
    assert denied(f"{url}?access_token={a['tokens']['refreshToken']}") == 401


def test_creature_owners(client):
    a, b, c = (register_and_login(client, n) for n in ("Alice", "Bob", "Chloe"))
    give(a["id"], "Brumel", 1)
    give(b["id"], "Brumel", 1)
    give(c["id"], "Brumel", 3)

    owners = client.get(f"{API}/creatures/{creature_id('Brumel')}/owners", headers=a["headers"]).json()
    assert owners["creature"]["name"] == "Brumel"
    # Le joueur connecté est exclu ; le plus d'exemplaires d'abord.
    assert [(o["player"]["pseudo"], o["quantity"]) for o in owners["items"]] == [("Chloe", 3), ("Bob", 1)]
    nobody = client.get(f"{API}/creatures/{creature_id('Moussou')}/owners", headers=a["headers"]).json()
    assert nobody["items"] == []
    problem(client.get(f"{API}/creatures/9999/owners", headers=a["headers"]), 404, "NOT_FOUND")
    problem(client.get(f"{API}/creatures/{creature_id('Brumel')}/owners"), 401, "UNAUTHENTICATED")


def test_card_gone_before_validation_is_removed_from_the_mat(client):
    """Une carte posée dans deux salles : le premier échange conclu la consomme, l'autre reste ouvert."""
    a, b, c = (register_and_login(client, n) for n in ("Alice", "Bob", "Chloe"))
    give(a["id"], "Moussou", 1)
    give(c["id"], "Cristille", 1)

    t_c = open_trade(client, a, c)
    with live(client, a, t_c["id"]) as room_a, live(client, c, t_c["id"]) as room_c:
        room_a.offer({"Moussou": 1})
        room_c.offer({"Cristille": 1})

        give(b["id"], "Brumel", 1)
        conclude_trade(client, a, b, {"Moussou": 1}, {"Brumel": 1})  # Moussou part chez Bob

        # Les deux tapis sont revérifiés à chaque validation : dès que Chloé valide, la carte
        # disparue est retirée du tapis d'Alice, personne n'a validé et les deux sont prévenues.
        trimmed = room_c.ready()
        assert trimmed["offered"] == [] and mat(trimmed["requested"]) == [("Cristille", 1)]
        assert trimmed["status"] == "PENDING"
        assert trimmed["proposerReady"] is False and trimmed["recipientReady"] is False
        assert room_a.error()["code"] == "CARDS_UNAVAILABLE"
        assert room_c.error()["code"] == "CARDS_UNAVAILABLE"
        # Plus rien sur le tapis d'Alice : impossible de valider.
        room_a.send(type="ready", ready=True)
        assert room_a.error()["code"] == "VALIDATION_ERROR"

    assert quantity(c["id"], "Cristille") == 1 and quantity(c["id"], "Moussou") == 0
    assert_stock_invariant()


def test_concurrent_conclusions_do_not_consume_same_copy(client):
    """Preuve qualité 03 : deux échanges conclus en même temps ne consomment pas le même exemplaire."""
    a = register_and_login(client, "Alice")
    give(a["id"], "Moussou", 1)  # un seul exemplaire, posé dans 5 salles
    others = []
    for name, card in [("Bob", "Brumel"), ("Chloe", "Cristille"), ("Dan", "Nuageon"),
                       ("Eve", "Solaris"), ("Fred", "Lucioli")]:  # fmt: skip
        p = register_and_login(client, name)
        give(p["id"], card, 1)
        trade_id = open_trade(client, a, p)["id"]
        with SessionLocal() as db:
            me, other = db.get(Utilisateur, a["id"]), db.get(Utilisateur, p["id"])
            trade_controller.set_offer(db, me, trade_id, [TradeItemIn(creature_id=creature_id("Moussou"), quantity=1)])
            trade_controller.set_offer(db, other, trade_id, [TradeItemIn(creature_id=creature_id(card), quantity=1)])
            trade_controller.set_ready(db, other, trade_id, True)
        others.append((p, card, trade_id))

    barrier = Barrier(len(others))

    def validate(entry):
        _, _, trade_id = entry
        with SessionLocal() as db:
            me = db.get(Utilisateur, a["id"])
            barrier.wait()
            trade, unavailable = trade_controller.set_ready(db, me, trade_id, True)
            return "unavailable" if unavailable else trade.statut.value

    with ThreadPoolExecutor(len(others)) as pool:
        results = list(pool.map(validate, others))

    assert sorted(results) == ["ACCEPTE"] + ["unavailable"] * (len(others) - 1)
    assert quantity(a["id"], "Moussou") == 0
    assert sum(quantity(p["id"], "Moussou") for p, _, _ in others) == 1
    # Seul le gagnant a donné sa carte ; les autres salles restent ouvertes, sans validation.
    assert sum(quantity(p["id"], card) for p, card, _ in others) == len(others) - 1
    statuses = sorted(t["status"] for t in client.get(f"{API}/trades", headers=a["headers"]).json()["items"])
    assert statuses == ["ACCEPTED"] + ["PENDING"] * (len(others) - 1)
    assert_stock_invariant()


def test_leaving_frees_the_seat(client):
    """Après un départ, le joueur n'apparaît plus présent (pas de joueur fantôme)."""
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    t = open_trade(client, a, b)
    with live(client, b, t["id"]):
        pass
    with live(client, a, t["id"]) as room:
        assert room.init["online"] == [str(a["id"])]
