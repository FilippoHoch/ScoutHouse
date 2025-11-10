from app.services import geocoding


def test_build_params_extracts_house_number_and_cleans_tokens() -> None:
    params = geocoding._build_params(
        address="Via Brione, 26, Brione, Gussago, BS, CAP 25064, Italia",
        locality="Brione",
        municipality="Gussago",
        province="BS",
        postal_code="25064",
        country="IT",
        limit=5,
    )

    assert params["street"] == "26 Via Brione"
    assert params["housenumber"] == "26"
    assert params["city"] == "Gussago"
    assert params["postalcode"] == "25064"
    assert "CAP" not in params["q"]
    assert "25064" in params["q"]


def test_build_params_handles_inline_house_number() -> None:
    params = geocoding._build_params(
        address="Via Roma 12",
        locality=None,
        municipality="Roma",
        province=None,
        postal_code=None,
        country="IT",
        limit=1,
    )

    assert params["street"] == "12 Via Roma"
    assert params["housenumber"] == "12"
    assert params["city"] == "Roma"
    assert "Via Roma" in params["q"]
    assert "12" in params["q"]
