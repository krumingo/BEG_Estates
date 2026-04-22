"""Regression тест за AI Import gating rules.

Root cause fix: архитектурни планове и summary таблици НЕ трябва да генерират
candidate_units или candidate_buyers. Само primary sources (area_schedule,
pricing, mixed, buyers) го правят.

Потребителският реален run беше: 4 файла (1 area schedule, 1 summary, 2 planove)
→ 1533 units / 38 buyers / 192 conflicts. Това е fake output от OCR dimension
fragments. След fix-а трябва да е ред на величина ~50 units, никакви buyers.
"""
from __future__ import annotations

import sys
from pathlib import Path

import fitz
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.document_import import analyze_files, classify  # noqa: E402


def _mkpdf(text: str, name: str) -> dict:
    doc = fitz.open()
    per_page = 45
    lines = text.splitlines()
    for i in range(0, len(lines), per_page):
        page = doc.new_page()
        y = 50
        for ln in lines[i:i + per_page]:
            page.insert_text((40, y), ln[:160], fontsize=8)
            y += 14
    blob = doc.write()
    doc.close()
    return {"id": name, "original_name": name, "content": blob}


def _build_realistic_set() -> list[dict]:
    # Primary area schedule — 18 apt + 19 parking
    area_text = "area schedule\n"
    area_text += "\n".join(
        f"APT.{100+i} | {1+(i%3)} rooms | {60.5+i*0.7:.2f} m2 | {85.0+i*0.5:.2f} m2 | {12000+i*500} EUR"
        for i in range(18)
    )
    area_text += "\n" + "\n".join(
        f"PM-{i+1:02d} | 12.5 m2 | 5000 EUR" for i in range(19)
    )
    # Summary taблица with bare dimension noise
    summary_text = "OBSHTO SGRADA summary\n" + "\n".join(
        "76 19 02 45 310 1250 6.2 8.1 12.3 4.5" for _ in range(50)
    )
    # Architectural plans
    plan1 = "NP165 SD-AR R05-1\n" + "\n".join(
        "3.45 2.80 4.12 101 102 76 19 02" for _ in range(80)
    )
    plan2 = "Hadji Dimitar R05-1\n" + "\n".join(
        "1.20 2.35 3.10 8.20 3.85" for _ in range(60)
    )
    return [
        _mkpdf(area_text, "Ploshto sgrada (1).pdf"),
        _mkpdf(summary_text, "tablica OBSHTO SGRADA (1).pdf"),
        _mkpdf(plan1, "000 - NP165-SD-AR.pdf"),
        _mkpdf(plan2, "001 - Hadji Dimitar - R05-1 (2) (1).pdf"),
    ]


def test_classification_matches_real_filenames():
    files = _build_realistic_set()
    got: dict[str, str] = {}
    for f in files:
        with fitz.open(stream=f["content"], filetype="pdf") as doc:
            text = "\n".join(p.get_text("text") for p in doc)
        got[f["original_name"]], _ = classify(f["original_name"], text)

    assert got["Ploshto sgrada (1).pdf"] == "area_schedule"
    assert got["tablica OBSHTO SGRADA (1).pdf"] == "summary_table"
    assert got["000 - NP165-SD-AR.pdf"] == "floor_plan"
    assert got["001 - Hadji Dimitar - R05-1 (2) (1).pdf"] == "floor_plan"


def test_scale_is_bounded_not_thousands():
    """Ако fix-ът regress-не, candidate_units пак ще скочи в хиляди."""
    result = analyze_files(_build_realistic_set())
    s = result["summary"]
    # Реалният mix е ~52; даваме ceiling 150 (запас за mixed / duplicate rows).
    assert s["candidate_units_count"] < 150, (
        f"Очаквани десетки units, получени {s['candidate_units_count']}. "
        "Вероятно floor_plan/summary_table/unknown пак генерират fake rows."
    )
    # Никакви buyers — в тези 4 файла няма buyer документ.
    assert s["candidate_buyers_count"] == 0
    # Няма дублирани codes → 0 conflicts.
    assert s["conflicts_count"] < 10


def test_floor_plan_does_not_spawn_units():
    files = [_build_realistic_set()[2], _build_realistic_set()[3]]  # само плановете
    result = analyze_files(files)
    assert result["summary"]["candidate_units_count"] == 0
    assert result["summary"]["candidate_buyers_count"] == 0
    assert len(result["candidate_floor_plans"]) > 0


def test_summary_table_does_not_spawn_units():
    files = [_build_realistic_set()[1]]  # само summary-то
    result = analyze_files(files)
    assert result["summary"]["candidate_units_count"] == 0
    assert result["summary"]["candidate_buyers_count"] == 0
    assert any("обобщаваща" in w for w in result["warnings"])


def test_unit_code_regex_rejects_bare_two_digit_fragments():
    """Dimension fragments като '76', '19', '02' НЕ трябва да стават apartment codes."""
    from services.document_import import UNIT_CODE_RE

    fake_line = "76 19 02 45"
    # За всеки match — ако изобщо има — той НЕ трябва да е bare 2-digit.
    for m in UNIT_CODE_RE.finditer(fake_line):
        groups = [g for g in m.groups() if g]
        assert groups, "match without any group"
        assert not (groups[0].isdigit() and len(groups[0]) < 3), (
            f"UNIT_CODE_RE прие bare fragment {groups[0]!r}"
        )


def test_garage_storage_shop_extracted_when_in_area_schedule():
    """GARAGE / STORAGE / SHOP (и кирилицата в real OCR) трябва да се извличат както PM."""
    # Тестовият PDF шрифт не рендерира кирилица, затова ползваме latin alias-и.
    # Real OCR текстът с „ГАРАЖ/СКЛАД/МАГАЗИН" минава през същия regex (case-insensitive).
    text = "\n".join([
        "GARAGE 1 | 18.0 m2 | 15000 EUR",
        "GARAGE 2 | 20.0 m2 | 16000 EUR",
        "STORAGE 1 | 4.5 m2 | 2000 EUR",
        "STORAGE 12 | 6.0 m2 | 2500 EUR",
        "SHOP 1 | 85.0 m2 | 90000 EUR",
    ])
    blob = {**_mkpdf(text, "pricing.pdf"), "document_type_override": "area_schedule"}
    result = analyze_files([blob])
    by_type = result["summary"]["by_type"]
    assert by_type["garage"] == 2, f"expected 2 garages, got {by_type}"
    assert by_type["storage"] == 2, f"expected 2 storages, got {by_type}"
    assert by_type["shop"] == 1, f"expected 1 shop, got {by_type}"


def test_technical_rooms_are_excluded():
    """Технически помещения (techno/machine/pump) не стават inventory."""
    text = "\n".join([
        "APT.201 | 2 rooms | 85 m2 | 100 m2 | 120000 EUR",
        "tehnichno 1 | 15 m2 | 0 EUR",
        "mashinno pomeshtenie | 8 m2 | 0 EUR",
        "asansyorna 1 | 5 m2 | 0 EUR",
    ])
    blob = {**_mkpdf(text, "pricing.pdf"), "document_type_override": "area_schedule"}
    result = analyze_files([blob])
    codes = {u["code"] for u in result["candidate_units"]}
    # Само апартаментът остава
    assert "201" in codes
    assert len(result["candidate_units"]) == 1


def _mkmultipage(pages: list[str], name: str) -> dict:
    doc = fitz.open()
    for page_lines in pages:
        p = doc.new_page()
        y = 50
        for ln in page_lines.splitlines():
            p.insert_text((40, y), ln[:160], fontsize=9)
            y += 14
    blob = doc.write()
    doc.close()
    return {"id": name, "original_name": name, "content": blob}


def test_multipage_floor_plan_extraction_with_floor_guess():
    """Архитектурен PDF с 6 етажа → 6 pages с floor guess + matched codes."""
    # Area schedule: 18 apts — същите codes, които ще се появят в плановете
    apts = (
        ["101", "102", "103", "104"]
        + ["201", "202", "203", "204"]
        + ["301", "302", "303"]
        + ["401", "402"]
        + ["501", "502", "503"]
        + ["601", "602"]
    )
    sched = "area schedule\n" + "\n".join(
        f"APT.{c} | 2 rooms | 80 m2 | 90 m2 | 100000 EUR" for c in apts
    )
    sched_blob = {**_mkpdf(sched, "Ploshti.pdf"), "document_type_override": "area_schedule"}

    # Architectural PDF: page-by-page
    pages = [
        "Cover\n(само заглавие)",
        "Legend\n(легенда)",
        "Етаж 2\n101 102 103 104\n3.45 2.80 4.12",
        "Етаж 3\n201 202 203 204\n4.10 3.55 2.70",
        "Етаж 4\n301 302 303\n3.80 2.95",
        "Етаж 5\n401 402\n4.00 3.20",
        "Етаж 6\n501 502 503\n3.50 2.85",
        "Етаж 7\n601 602\n3.30 4.40",
    ]
    arch_blob = {**_mkmultipage(pages, "SD-AR-R05.pdf"), "document_type_override": "floor_plan"}

    result = analyze_files([sched_blob, arch_blob])

    fps = result["candidate_floor_plans"]
    # 8 pages в архитектурния + 0 от schedule-а
    assert len(fps) == 8

    # Страниците 3..8 трябва да имат floor guess и matched codes
    by_page = {p["page_number"]: p for p in fps if p["source_file_id"] == "SD-AR-R05.pdf"}
    assert by_page[3]["detected_floor_guess"] == 2
    assert set(by_page[3]["matched_unit_codes"]) == {"101", "102", "103", "104"}
    assert by_page[4]["detected_floor_guess"] == 3
    assert by_page[5]["detected_floor_guess"] == 4
    assert by_page[6]["detected_floor_guess"] == 5
    assert by_page[7]["detected_floor_guess"] == 6
    assert by_page[8]["detected_floor_guess"] == 7

    # Cover/legend без кодове → no floor guess + warning
    assert by_page[1]["detected_floor_guess"] is None
    assert any("не може" in w.lower() for w in by_page[1]["warnings"])

    # Summary metrics
    s = result["summary"]
    assert s["floor_plan_pages_total"] == 8
    assert s["auto_linked_pages"] == 6  # 6-те страници с floor+match
    assert s["unlinked_pages"] == 2
    # Всички 18 apt-а от schedule са поставени → unplaced_units == 0
    assert s["unplaced_units"] == 0


def test_floor_guess_from_hundreds_fallback():
    """Ако няма explicit текст „Етаж N", hundreds-group cluster дава floor."""
    pages = ["101 102 103 104\n3.45 2.80 4.12"]
    blob = {**_mkmultipage(pages, "plan.pdf"), "document_type_override": "floor_plan"}
    result = analyze_files([blob])
    fp = result["candidate_floor_plans"][0]
    assert fp["detected_floor_guess"] == 2  # hundreds 1 → floor 2
    assert fp["floor_guess_confidence"] > 0
    assert fp["floor_guess_confidence"] < 0.8  # fallback е по-несигурен от explicit


def test_apartment_code_with_prefix_is_accepted():
    from services.document_import import UNIT_CODE_RE, _unit_code_from_match

    m = UNIT_CODE_RE.search("APT.305 | 2 rooms | 85 m2")
    assert m is not None
    assert _unit_code_from_match(m) == "305"


def test_document_type_override_beats_ai_guess():
    """AI класифицира файла като unknown, но админският override го форсира в area_schedule."""
    text = "inventory\n" + "\n".join(
        f"APT.{200+i} | 2 rooms | {70+i} m2 | {90+i} m2 | {15000+i*100} EUR"
        for i in range(5)
    )
    blob = _mkpdf(text, "misnamed.pdf")

    # Без override: "misnamed" няма никакви hints → unknown → 0 units
    result_no = analyze_files([blob])
    assert result_no["summary"]["candidate_units_count"] == 0

    # С override: forced area_schedule → 5 units
    blob_over = {**blob, "document_type_override": "area_schedule"}
    result_yes = analyze_files([blob_over])
    assert result_yes["summary"]["candidate_units_count"] == 5
    pf = result_yes["per_file"][0]
    assert pf["document_type_applied"] == "area_schedule"
    assert pf["document_type_override"] == "area_schedule"
    assert pf["extracted_units_count"] == 5
    assert pf["extracted_units_by_type"]["apartment"] == 5


def test_breakdown_by_type_and_per_file():
    """Summary трябва да носи by_type и sanity_warnings за missing categories."""
    text = "\n".join(
        f"APT.{100+i} | 2 rooms | {60+i} m2 | {80+i} m2 | {12000+i*100} EUR"
        for i in range(18)
    )
    blob = {**_mkpdf(text, "Ploshti (1).pdf"), "document_type_override": "area_schedule"}
    result = analyze_files([blob])
    by_type = result["summary"]["by_type"]
    assert by_type["apartment"] == 18
    assert by_type["parking"] == 0
    assert by_type["storage"] == 0

    # Sanity warnings — трябва да съдържат missing parking/storage notes
    warns = result["summary"]["sanity_warnings"]
    assert any("паркоместа" in w for w in warns)
    assert any("складове" in w for w in warns)
    # Apartment-level warning, защото 18 < 15 → не; но total 18 < 45 → да.
    assert any("непълен" in w.lower() for w in warns)
