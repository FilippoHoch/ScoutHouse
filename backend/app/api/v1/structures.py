from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models import Structure
from app.schemas import StructureCreate, StructureRead

router = APIRouter()


DbSession = Annotated[Session, Depends(get_db)]


@router.get("/", response_model=list[StructureRead])
def list_structures(db: DbSession) -> Sequence[Structure]:
    result = db.execute(select(Structure).order_by(Structure.created_at.desc()))
    return list(result.scalars().all())


@router.get("/{structure_id}", response_model=StructureRead)
def get_structure(structure_id: int, db: DbSession) -> Structure:
    structure = db.get(Structure, structure_id)
    if structure is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Structure not found",
        )
    return structure


@router.post("/", response_model=StructureRead, status_code=status.HTTP_201_CREATED)
def create_structure(structure_in: StructureCreate, db: DbSession) -> Structure:
    structure = Structure(**structure_in.model_dump())
    db.add(structure)
    db.commit()
    db.refresh(structure)
    return structure
