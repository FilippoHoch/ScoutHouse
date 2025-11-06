"""Tests for Prometheus metrics helpers."""

from types import SimpleNamespace

import pytest

from app.core import metrics as metrics_module


class _FakeGauge:
    def __init__(self):
        self.calls: list[float] = []

    def set(self, value: float) -> None:
        self.calls.append(value)


@pytest.fixture(autouse=True)
def _fake_gauge(monkeypatch):
    fake_gauge = _FakeGauge()
    monkeypatch.setattr(metrics_module, "DB_POOL_IN_USE", fake_gauge, raising=False)
    yield fake_gauge


def test_record_db_pool_metrics_with_callable(monkeypatch, _fake_gauge):
    class FakePool:
        def checkedout(self):
            return 3

    monkeypatch.setattr(metrics_module, "engine", SimpleNamespace(pool=FakePool()))

    metrics_module._record_db_pool_metrics(None)

    assert _fake_gauge.calls == [3.0]


def test_record_db_pool_metrics_with_attribute(monkeypatch, _fake_gauge):
    class FakePool:
        checkedout = 5

    monkeypatch.setattr(metrics_module, "engine", SimpleNamespace(pool=FakePool()))

    metrics_module._record_db_pool_metrics(None)

    assert _fake_gauge.calls == [5.0]


def test_record_db_pool_metrics_handles_errors(monkeypatch, _fake_gauge):
    class FakePool:
        def checkedout(self):
            raise RuntimeError("boom")

    monkeypatch.setattr(metrics_module, "engine", SimpleNamespace(pool=FakePool()))

    metrics_module._record_db_pool_metrics(None)

    assert _fake_gauge.calls == []


def test_setup_metrics_registers_instrumentation(monkeypatch):
    added_metrics = []
    instrumented_apps = []

    class FakeInstrumentator:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def add(self, callback):
            added_metrics.append(callback)
            return self

        def instrument(self, app):
            instrumented_apps.append(("instrument", app))
            return self

        def expose(self, app, include_in_schema):
            instrumented_apps.append(("expose", app, include_in_schema))
            return self

    sentinel_default = object()
    sentinel_requests = object()
    sentinel_latency = object()

    monkeypatch.setattr(metrics_module, "Instrumentator", FakeInstrumentator)
    monkeypatch.setattr(metrics_module.metrics, "default", lambda: sentinel_default)
    monkeypatch.setattr(metrics_module.metrics, "requests", lambda: sentinel_requests)
    monkeypatch.setattr(metrics_module.metrics, "latency", lambda: sentinel_latency)

    app = object()

    instrumentator = metrics_module.setup_metrics(app)

    assert isinstance(instrumentator, FakeInstrumentator)
    assert instrumentator.kwargs == {
        "should_group_status_codes": False,
        "should_ignore_untemplated": True,
    }
    assert added_metrics == [
        sentinel_default,
        sentinel_requests,
        sentinel_latency,
        metrics_module._record_db_pool_metrics,
    ]
    assert instrumented_apps == [
        ("instrument", app),
        ("expose", app, False),
    ]
