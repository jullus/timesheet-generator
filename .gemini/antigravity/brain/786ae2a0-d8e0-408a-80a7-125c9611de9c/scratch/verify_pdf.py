import pdfplumber
import sys

with pdfplumber.open("timesheets/2026-03_timesheet.pdf") as pdf:
    for page in pdf.pages:
        print(page.extract_text())
