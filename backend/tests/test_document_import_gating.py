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


def test_apartment_code_with_prefix_is_accepted():
    from services.document_import import UNIT_CODE_RE, _unit_code_from_match

    m = UNIT_CODE_RE.search("APT.305 | 2 rooms | 85 m2")
    assert m is not None
    assert _unit_code_from_match(m) == "305"
