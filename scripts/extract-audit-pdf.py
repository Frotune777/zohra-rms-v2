"""Read a downloaded audit PDF; does not execute PDF actions or access databases."""
import json
import sys
from pypdf import PdfReader
reader = PdfReader(sys.argv[1], strict=True)
print(json.dumps({"pages": len(reader.pages), "text": "\n".join(page.extract_text() or "" for page in reader.pages)}, ensure_ascii=False))
