from __future__ import annotations

from io import BytesIO
from openpyxl import Workbook
from openpyxl.utils import get_column_letter

from app.models.quote import Quote


def quote_to_xlsx(quote: Quote) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Preventivo"

    sheet.append(["Preventivo", f"#{quote.id}"])
    sheet.append(["Evento", quote.event_id])
    structure_name = getattr(quote.structure, "name", None) if quote.structure else None
    sheet.append(["Struttura", structure_name or quote.structure_id])
    sheet.append(["Scenario", quote.scenario.value])
    sheet.append(["Valuta", quote.currency])
    sheet.append([])

    sheet.append(["Voce", "Quantità", "Importo unitario", "Totale"])
    for entry in quote.breakdown:
        sheet.append(
            [
                entry.get("description"),
                entry.get("quantity"),
                entry.get("unit_amount"),
                entry.get("total"),
            ]
        )

    sheet.append([])
    totals = quote.totals or {}
    sheet.append(["Subtotale", None, None, totals.get("subtotal", 0)])
    sheet.append(["Utenze", None, None, totals.get("utilities", 0)])
    sheet.append(["Tassa di soggiorno", None, None, totals.get("city_tax", 0)])
    sheet.append(["Totale", None, None, totals.get("total", 0)])
    sheet.append(["Caparre", None, None, totals.get("deposit", 0)])

    for column in range(1, 5):
        sheet.column_dimensions[get_column_letter(column)].width = 20

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


__all__ = ["quote_to_xlsx"]
