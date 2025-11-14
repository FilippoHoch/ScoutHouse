from datetime import date

from pydantic import BaseModel, Field

from app.models.event import EventStatus


class LandingStructureSample(BaseModel):
    name: str
    slug: str
    province: str | None = None
    indoor_beds: int | None = Field(default=None, ge=0)


class LandingEventSample(BaseModel):
    id: int
    title: str
    status: EventStatus
    start_date: date
    end_date: date
    participants_total: int = Field(default=0, ge=0)


class LandingSnapshot(BaseModel):
    structures_total: int = Field(default=0, ge=0)
    provinces_total: int = Field(default=0, ge=0)
    beds_total: int = Field(default=0, ge=0)
    events_total: int = Field(default=0, ge=0)
    participants_total: int = Field(default=0, ge=0)
    structures: list[LandingStructureSample] = Field(default_factory=list)
    events: list[LandingEventSample] = Field(default_factory=list)


__all__ = [
    "LandingSnapshot",
    "LandingStructureSample",
    "LandingEventSample",
]
