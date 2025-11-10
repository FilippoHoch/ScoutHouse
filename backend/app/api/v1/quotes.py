from __future__ import annotations

import html
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.deps import get_current_user, require_event_member
from app.models import Event, EventMember, EventMemberRole, Quote, Structure, User
from app.schemas import (
    QuoteBreakdownEntry,
    QuoteCalcRequest,
    QuoteCalcResponse,
    QuoteCreate,
    QuoteListItem,
    QuoteRead,
    QuoteScenarios,
    QuoteTotals,
)
from app.services.audit import record_audit
from app.services.costs import apply_scenarios, calc_quote
from app.services.export import quote_to_xlsx

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
EventViewer = Annotated[EventMember, Depends(require_event_member(EventMemberRole.VIEWER))]
EventCollaborator = Annotated[EventMember, Depends(require_event_member(EventMemberRole.COLLAB))]

_ROLE_RANK = {
    EventMemberRole.VIEWER: 1,
    EventMemberRole.COLLAB: 2,
    EventMemberRole.OWNER: 3,
}


def _ensure_membership(db: Session, event_id: int, user: User, min_role: EventMemberRole) -> None:
    membership = (
        db.execute(
            select(EventMember).where(
                EventMember.event_id == event_id, EventMember.user_id == user.id
            )
        )
        .scalars()
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    if _ROLE_RANK[membership.role] < _ROLE_RANK[min_role]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")


def _get_event(db: Session, event_id: int) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _get_structure(db: Session, structure_id: int) -> Structure:
    structure = (
        db.execute(
            select(Structure)
            .options(joinedload(Structure.cost_options))
            .where(Structure.id == structure_id)
        )
        .unique()
        .scalar_one_or_none()
    )
    if structure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Structure not found")
    return structure


def _get_quote(db: Session, quote_id: int) -> Quote:
    quote = db.execute(
        select(Quote).options(joinedload(Quote.structure)).where(Quote.id == quote_id)
    ).scalar_one_or_none()
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    return quote


@router.post("/quotes/calc", response_model=QuoteCalcResponse)
def calculate_quote(
    payload: QuoteCalcRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> QuoteCalcResponse:
    _ensure_membership(db, payload.event_id, current_user, EventMemberRole.VIEWER)
    event = _get_event(db, payload.event_id)
    structure = _get_structure(db, payload.structure_id)

    overrides_payload = (
        payload.overrides.model_dump(exclude_none=True) if payload.overrides else None
    )
    calculation = calc_quote(event, structure, overrides=overrides_payload)
    totals = QuoteTotals.model_validate(calculation["totals"])
    breakdown = [
        QuoteBreakdownEntry.model_validate(item) for item in calculation["breakdown"]
    ]
    scenarios = QuoteScenarios.model_validate(apply_scenarios(totals.total))

    return QuoteCalcResponse(
        currency=calculation["currency"],
        totals=totals,
        breakdown=breakdown,
        inputs=calculation["inputs"],
        scenarios=scenarios,
    )


@router.post(
    "/events/{event_id}/quotes",
    response_model=QuoteRead,
    status_code=status.HTTP_201_CREATED,
)
def create_quote(
    event_id: int,
    payload: QuoteCreate,
    db: DbSession,
    request: Request,
    membership: EventCollaborator,
) -> QuoteRead:
    event = _get_event(db, event_id)
    structure = _get_structure(db, payload.structure_id)

    overrides_payload = (
        payload.overrides.model_dump(exclude_none=True) if payload.overrides else None
    )
    calculation = calc_quote(event, structure, overrides=overrides_payload)
    totals = QuoteTotals.model_validate(calculation["totals"])
    breakdown = [
        QuoteBreakdownEntry.model_validate(item) for item in calculation["breakdown"]
    ]
    scenarios = QuoteScenarios.model_validate(apply_scenarios(totals.total))

    quote = Quote(
        event_id=event.id,
        structure_id=structure.id,
        scenario=payload.scenario,
        currency=calculation["currency"],
        totals=totals.model_dump(),
        breakdown=[entry.model_dump() for entry in breakdown],
        inputs=calculation["inputs"],
    )
    db.add(quote)
    db.flush()

    response = QuoteRead(
        id=quote.id,
        event_id=quote.event_id,
        structure_id=quote.structure_id,
        scenario=quote.scenario,
        currency=quote.currency,
        totals=totals,
        breakdown=breakdown,
        inputs=quote.inputs,
        scenarios=scenarios,
        created_at=quote.created_at,
    )

    record_audit(
        db,
        actor=getattr(membership, "user", None),
        action="quote.create",
        entity_type="quote",
        entity_id=quote.id,
        diff={"after": response.model_dump()},
        request=request,
    )

    db.commit()
    db.refresh(quote)

    return response


@router.get("/events/{event_id}/quotes", response_model=list[QuoteListItem])
def list_quotes(
    event_id: int,
    db: DbSession,
    _: EventViewer,
) -> list[QuoteListItem]:
    _get_event(db, event_id)
    results = db.execute(
        select(Quote, Structure.name)
        .join(Structure, Structure.id == Quote.structure_id)
        .where(Quote.event_id == event_id)
        .order_by(Quote.created_at.desc())
    ).all()

    items: list[QuoteListItem] = []
    for quote, structure_name in results:
        totals = quote.totals or {}
        items.append(
            QuoteListItem(
                id=quote.id,
                event_id=quote.event_id,
                structure_id=quote.structure_id,
                structure_name=structure_name,
                scenario=quote.scenario,
                currency=quote.currency,
                total=float(totals.get("total", 0)),
                created_at=quote.created_at,
            )
        )
    return items


@router.get("/quotes/{quote_id}", response_model=QuoteRead)
def get_quote(
    quote_id: int,
    db: DbSession,
    current_user: CurrentUser,
) -> QuoteRead:
    quote = _get_quote(db, quote_id)
    _ensure_membership(db, quote.event_id, current_user, EventMemberRole.VIEWER)
    totals = QuoteTotals.model_validate(quote.totals)
    breakdown = [
        QuoteBreakdownEntry.model_validate(item) for item in quote.breakdown or []
    ]
    scenarios = QuoteScenarios.model_validate(apply_scenarios(totals.total))
    return QuoteRead(
        id=quote.id,
        event_id=quote.event_id,
        structure_id=quote.structure_id,
        scenario=quote.scenario,
        currency=quote.currency,
        totals=totals,
        breakdown=breakdown,
        inputs=quote.inputs,
        scenarios=scenarios,
        created_at=quote.created_at,
    )


@router.get("/quotes/{quote_id}/export")
def export_quote(
    quote_id: int,
    db: DbSession,
    current_user: CurrentUser,
    format: Annotated[str, Query(pattern="^(xlsx|html)$")] = "xlsx",
):
    quote = _get_quote(db, quote_id)
    _ensure_membership(db, quote.event_id, current_user, EventMemberRole.VIEWER)

    if format == "xlsx":
        data = quote_to_xlsx(quote)
        filename = f"quote-{quote.id}.xlsx"
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    structure_name = getattr(quote.structure, "name", None) if quote.structure else None
    totals = quote.totals or {}
    rows = "".join(
        f"<tr><td>{html.escape(str(entry.get('description', '')))}</td>"
        f"<td>{entry.get('quantity', '')}</td>"
        f"<td>{entry.get('unit_amount', '')}</td>"
        f"<td>{entry.get('total', '')}</td></tr>"
        for entry in quote.breakdown
    )
    html_output = f"""
    <!DOCTYPE html>
    <html lang=\"it\">
      <head>
        <meta charset=\"utf-8\" />
        <title>Preventivo #{quote.id}</title>
        <style>
          body {{ font-family: sans-serif; margin: 2rem; }}
          table {{ border-collapse: collapse; width: 100%; margin-top: 1rem; }}
          th, td {{ border: 1px solid #ccc; padding: 0.5rem; text-align: left; }}
          h1 {{ margin-bottom: 0; }}
          .meta p {{ margin: 0.2rem 0; }}
        </style>
      </head>
      <body>
        <h1>Preventivo #{quote.id}</h1>
        <div class=\"meta\">
          <p>Evento: {quote.event_id}</p>
          <p>Struttura: {html.escape(structure_name or str(quote.structure_id))}</p>
          <p>Scenario: {quote.scenario.value}</p>
          <p>Valuta: {quote.currency}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Voce</th>
              <th>Quantità</th>
              <th>Importo unitario</th>
              <th>Totale</th>
            </tr>
          </thead>
          <tbody>
            {rows}
          </tbody>
        </table>
        <h2>Riepilogo</h2>
        <ul>
          <li>Subtotale: {totals.get("subtotal", 0)}</li>
          <li>Utenze: {totals.get("utilities", 0)}</li>
          <li>Tassa di soggiorno: {totals.get("city_tax", 0)}</li>
          <li>Totale: {totals.get("total", 0)}</li>
          <li>Caparre: {totals.get("deposit", 0)}</li>
        </ul>
      </body>
    </html>
    """
    return HTMLResponse(content=html_output)


__all__ = [
    "router",
]
