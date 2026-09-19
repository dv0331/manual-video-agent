#!/usr/bin/env python3
import sys
from pathlib import Path
import pypdfium2 as pdfium

src, dest, max_pages = sys.argv[1], Path(sys.argv[2]), int(sys.argv[3])
dest.mkdir(parents=True, exist_ok=True)
pdf = pdfium.PdfDocument(src)
count = min(max_pages, len(pdf))
for i in range(count):
    pdf[i].render(scale=1.5).to_pil().save(dest / f"page-{i+1:03d}.png")
print(count)
