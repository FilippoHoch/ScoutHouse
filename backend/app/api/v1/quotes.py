from __future__ import annotations

import html
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.models import Event, Quote, Structure
from app.schemas import (
    QuoteCalcRequest,
    QuoteCalcResponse,
    QuoteCreate,
    QuoteListItem,
    QuoteRead,
    QuoteScenarios,
)
from app.services.costs import apply_scenarios, calc_quote
from app.services.export import quote_to_xlsx

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


def _get_event(db: Session, event_id: int) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _get_structure(db: Session, structure_id: int) -> Structure:
    structure = db.execute(
        select(Structure)
        .options(joinedload(Structure.cost_options))
        .where(Structure.id == structure_id)
    ).unique().scalar_one_or_none()
    if structure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Structure not found")
    return structure


def _get_quote(db: Session, quote_id: int) -> Quote:
    quote = db.execute(
        select(Quote)
        .options(joinedload(Quote.structure))
        .where(Quote.id == quote_id)
    ).scalar_one_or_none()
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    return quote


@router.post("/quotes/calc", response_model=QuoteCalcResponse)
def calculate_quote(payload: QuoteCalcRequest, db: DbSession) -> QuoteCalcResponse:
    event = _get_event(db, payload.event_id)
    structure = _get_structure(db, payload.structure_id)

    calculation = calc_quote(event, structure, overrides=payload.overrides)
    scenarios = QuoteScenarios.model_validate(
        apply_scenarios(calculation["totals"]["total"])
    )

    return QuoteCalcResponse(
        currency=calculation["currency"],
        totals=calculation["totals"],
        breakdown=calculation["breakdown"],
        inputs=calculation["inputs"],
        scenarios=scenarios,
    )


@router.post(
    "/events/{event_id}/quotes",
    response_model=QuoteRead,
    status_code=status.HTTP_201_CREATED,
)
def create_quote(event_id: int, payload: QuoteCreate, db: DbSession) -> QuoteRead:
    event = _get_event(db, event_id)
    structure = _get_structure(db, payload.structure_id)

    calculation = calc_quote(event, structure, overrides=payload.overrides)
    scenarios = QuoteScenarios.model_validate(
        apply_scenarios(calculation["totals"]["total"])
    )

    quote = Quote(
        event_id=event.id,
        structure_id=structure.id,
        scenario=payload.scenario,
        currency=calculation["currency"],
        totals=calculation["totals"],
        breakdown=calculation["breakdown"],
        inputs=calculation["inputs"],
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)

    return QuoteRead(
        id=quote.id,
        event_id=quote.event_id,
        structure_id=quote.structure_id,
        scenario=quote.scenario,
        currency=quote.currency,
        totals=quote.totals,
        breakdown=quote.breakdown,
        inputs=quote.inputs,
        scenarios=scenarios,
        created_at=quote.created_at,
    )


@router.get("/events/{event_id}/quotes", response_model=list[QuoteListItem])
def list_quotes(event_id: int, db: DbSession) -> list[QuoteListItem]:
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
def get_quote(quote_id: int, db: DbSession) -> QuoteRead:
    quote = _get_quote(db, quote_id)
    scenarios = QuoteScenarios.model_validate(
        apply_scenarios(quote.totals.get("total", 0))
    )
    return QuoteRead(
        id=quote.id,
        event_id=quote.event_id,
        structure_id=quote.structure_id,
        scenario=quote.scenario,
        currency=quote.currency,
        totals=quote.totals,
        breakdown=quote.breakdown,
        inputs=quote.inputs,
        scenarios=scenarios,
        created_at=quote.created_at,
    )


@router.get("/quotes/{quote_id}/export")
def export_quote(
    quote_id: int,
    db: DbSession,
    format: str = Query(default="xlsx", pattern="^(xlsx|html)$"),
):
    quote = _get_quote(db, quote_id)

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
          <li>Subtotale: {totals.get('subtotal', 0)}</li>
          <li>Utenze: {totals.get('utilities', 0)}</li>
          <li>Tassa di soggiorno: {totals.get('city_tax', 0)}</li>
          <li>Totale: {totals.get('total', 0)}</li>
          <li>Caparre: {totals.get('deposit', 0)}</li>
        </ul>
      </body>
    </html>
    """
    return HTMLResponse(content=html_output)


__all__ = [
    "router",
]
