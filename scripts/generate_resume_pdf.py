#!/usr/bin/env python3
"""Generate PDF resume from cv/_index.md using fpdf2 (pure Python, no system deps)"""

import tomllib
from pathlib import Path
from fpdf import FPDF


def parse_cv_file(path: Path) -> tuple[dict, str]:
    """Extract TOML frontmatter and markdown body."""
    content = path.read_text()
    parts = content.split("+++")
    toml_str = parts[1]
    markdown_body = parts[2].strip() if len(parts) > 2 else ""
    summary = markdown_body.replace("## Summary", "").strip()
    return tomllib.loads(toml_str), summary


class ResumePDF(FPDF):
    def __init__(self):
        super().__init__()
        self.set_auto_page_break(auto=True, margin=15)

    def header_section(self):
        self.set_font("Helvetica", "B", 20)
        self.cell(0, 10, "Jonathan Sarig", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 12)
        self.set_text_color(80, 80, 80)
        self.cell(0, 6, "Software Engineer", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(4)

    def section_title(self, title: str):
        self.set_font("Helvetica", "B", 11)
        self.cell(0, 8, title.upper(), new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(0, 0, 0)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(3)

    def add_summary(self, text: str):
        self.section_title("Summary")
        self.set_font("Helvetica", "", 10)
        self.multi_cell(0, 5, text)
        self.ln(2)

    def add_experience(self, jobs: list):
        self.section_title("Professional Experience")
        for job in jobs:
            # Job title and date on same line
            self.set_font("Helvetica", "B", 10)
            title_company = f"{job['title']} - {job['company']}"
            self.cell(140, 5, title_company)
            self.set_font("Helvetica", "", 9)
            self.set_text_color(80, 80, 80)
            self.cell(0, 5, job["date"], align="R", new_x="LMARGIN", new_y="NEXT")
            # Location
            self.set_font("Helvetica", "", 9)
            self.cell(0, 4, job["location"], new_x="LMARGIN", new_y="NEXT")
            self.set_text_color(0, 0, 0)
            # Bullet points
            self.set_font("Helvetica", "", 9)
            for point in job.get("points", []):
                self.set_x(15)
                self.multi_cell(0, 4, f"- {point}")
            self.ln(2)

    def add_skills(self, skills: list):
        self.section_title("Technical Skills")
        self.set_font("Helvetica", "", 10)
        for skill in skills:
            items = ", ".join(skill.get("items", []))
            self.set_font("Helvetica", "B", 10)
            category_width = self.get_string_width(f"{skill['category']}: ") + 1
            self.cell(category_width, 5, f"{skill['category']}: ")
            self.set_font("Helvetica", "", 10)
            self.cell(0, 5, items, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def add_certifications(self, certs: list):
        self.section_title("Certifications")
        self.set_font("Helvetica", "", 10)
        for cert in certs:
            self.set_x(15)
            self.cell(0, 5, f"- {cert['name']} - {cert['organization']} ({cert['date']})", new_x="LMARGIN", new_y="NEXT")


def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    cv_path = project_root / "content" / "cv" / "_index.md"
    output_path = project_root / "static" / "resume.pdf"

    data, summary = parse_cv_file(cv_path)
    extra = data.get("extra", {})

    pdf = ResumePDF()
    pdf.add_page()
    pdf.set_margins(10, 10, 10)

    pdf.header_section()
    pdf.add_summary(summary)
    pdf.add_experience(extra.get("experience", []))
    pdf.add_skills(extra.get("skills", []))
    pdf.add_certifications(extra.get("certifications", []))

    pdf.output(output_path)
    print(f"Generated {output_path}")


if __name__ == "__main__":
    main()
