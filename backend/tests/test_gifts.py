"""Don de carte entre joueurs (contrat « Gift ») : création, acceptation, refus, annulation."""

from conftest import (
    API,
    assert_stock_invariant,
    creature_id,
    give,
    problem,
    quantity,
    register_and_login,
    set_stock,
)


def create_gift(client, giver, recipient_id, name, quantity=1):
    return client.post(
        f"{API}/gifts",
        json={"recipientId": str(recipient_id), "creatureId": creature_id(name), "quantity": quantity},
        headers=giver["headers"],
    )


def test_gift_accepted_moves_cards(client):
    """Alice offre 2 Moussou à Bob ; Bob accepte : les cartes passent dans sa collection."""
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 2)

    r = create_gift(client, a, b["id"], "Moussou", 2)
    assert r.status_code == 201, r.text
    gift = r.json()
    assert gift["status"] == "PENDING"
    assert gift["giver"]["pseudo"] == "Alice" and gift["recipient"]["pseudo"] == "Bob"
    assert gift["creature"]["name"] == "Moussou" and gift["quantity"] == 2
    assert gift["decidedAt"] is None

    # Le destinataire le voit dans ses dons reçus en attente.
    received = client.get(f"{API}/gifts", params={"role": "received", "status": "PENDING"}, headers=b["headers"])
    assert [g["id"] for g in received.json()["items"]] == [gift["id"]]

    accepted = client.post(f"{API}/gifts/{gift['id']}/accept", headers=b["headers"])
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "ACCEPTED" and accepted.json()["decidedAt"] is not None

    assert quantity(a["id"], "Moussou") == 0
    assert quantity(b["id"], "Moussou") == 2


def test_gift_refused_moves_nothing(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 1)
    gift = create_gift(client, a, b["id"], "Moussou").json()

    refused = client.post(f"{API}/gifts/{gift['id']}/refuse", headers=b["headers"])
    assert refused.status_code == 200 and refused.json()["status"] == "REFUSED"
    assert quantity(a["id"], "Moussou") == 1 and quantity(b["id"], "Moussou") == 0


def test_gift_cancelled_by_giver(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 1)
    gift = create_gift(client, a, b["id"], "Moussou").json()

    cancelled = client.post(f"{API}/gifts/{gift['id']}/cancel", headers=a["headers"])
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "CANCELLED"
    # Après annulation, il n'attend plus la décision du destinataire.
    r = client.post(f"{API}/gifts/{gift['id']}/accept", headers=b["headers"])
    problem(r, 409, "GIFT_NOT_PENDING")


def test_only_recipient_accepts_only_giver_cancels(client):
    a, b, c = (register_and_login(client, n) for n in ("Alice", "Bob", "Carol"))
    give(a["id"], "Moussou", 1)
    gift = create_gift(client, a, b["id"], "Moussou").json()

    problem(client.post(f"{API}/gifts/{gift['id']}/accept", headers=a["headers"]), 403, "FORBIDDEN")
    problem(client.post(f"{API}/gifts/{gift['id']}/accept", headers=c["headers"]), 403, "FORBIDDEN")
    problem(client.post(f"{API}/gifts/{gift['id']}/cancel", headers=b["headers"]), 403, "FORBIDDEN")


def test_cannot_gift_to_self(client):
    a = register_and_login(client, "Alice")
    give(a["id"], "Moussou", 1)
    r = create_gift(client, a, a["id"], "Moussou")
    problem(r, 422, "GIFT_WITH_SELF")


def test_cannot_gift_more_than_owned(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 1)
    r = create_gift(client, a, b["id"], "Moussou", 2)
    body = problem(r, 400, "VALIDATION_ERROR")
    assert body["errors"][0]["field"] == "quantity"


def test_cannot_gift_card_not_owned(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    r = create_gift(client, a, b["id"], "Moussou")  # Alice ne possède rien
    problem(r, 400, "VALIDATION_ERROR")


def test_duplicate_pending_gift_rejected(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 2)
    assert create_gift(client, a, b["id"], "Moussou").status_code == 201
    problem(create_gift(client, a, b["id"], "Moussou"), 409, "GIFT_ALREADY_PENDING")


def test_accept_fails_when_giver_no_longer_owns(client):
    """Alice a 1 Moussou, l'offre à Bob ET à Carol ; Bob accepte, Carol échoue (ECHOUE)."""
    a, b, c = (register_and_login(client, n) for n in ("Alice", "Bob", "Carol"))
    give(a["id"], "Moussou", 1)
    to_bob = create_gift(client, a, b["id"], "Moussou").json()
    to_carol = create_gift(client, a, c["id"], "Moussou").json()

    assert client.post(f"{API}/gifts/{to_bob['id']}/accept", headers=b["headers"]).json()["status"] == "ACCEPTED"

    failed = client.post(f"{API}/gifts/{to_carol['id']}/accept", headers=c["headers"])
    assert failed.status_code == 200 and failed.json()["status"] == "FAILED"
    assert failed.json()["failureReason"] == "CARDS_UNAVAILABLE"
    assert quantity(b["id"], "Moussou") == 1 and quantity(c["id"], "Moussou") == 0


def test_legendary_gift_keeps_stock_invariant(client):
    """Un don de légendaire déplace les exemplaires sans toucher au stock total."""
    set_stock({"Serazou": 50}, others=0)
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Serazou", 2)

    gift = create_gift(client, a, b["id"], "Serazou", 2).json()
    assert client.post(f"{API}/gifts/{gift['id']}/accept", headers=b["headers"]).json()["status"] == "ACCEPTED"

    assert quantity(a["id"], "Serazou") == 0 and quantity(b["id"], "Serazou") == 2
    assert_stock_invariant()
