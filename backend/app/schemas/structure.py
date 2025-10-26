from datetime import datetime

from pydantic import BaseModel

from app.models.structure import StructureType


class StructureBase(BaseModel):
    name: str
    slug: str
    province: str | None = None
    type: StructureType


class StructureCreate(StructureBase):
    pass


class StructureRead(StructureBase):
    id: int
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }
