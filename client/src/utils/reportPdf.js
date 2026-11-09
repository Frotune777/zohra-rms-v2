import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import latinUrl from "../assets/fonts/NotoSans-Regular.ttf?url";
import hindiUrl from "../assets/fonts/NotoSansDevanagari-Regular.ttf?url";
let fonts;
async function loadFonts() {
  if (!fonts)
    fonts = Promise.all(
      [latinUrl, hindiUrl].map(async (url) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error("Report font unavailable");
        const bytes = new Uint8Array(await r.arrayBuffer());
        let text = "";
        for (let i = 0; i < bytes.length; i += 8192)
          text += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(text);
      }),
    ).catch((e) => {
      fonts = null;
      throw e;
    });
  return fonts;
}
export async function reportPdf(data, title) {
  const [latin, hindi] = await loadFonts();
  const headers = [...new Set(data.flatMap((row) => Object.keys(row)))];
  const doc = new jsPDF({
    orientation: headers.length > 6 ? "landscape" : "portrait",
    compress: true,
  });
  for (const [name, font] of [
    ["NotoSans", latin],
    ["NotoHindi", hindi],
  ]) {
    doc.addFileToVFS(name + ".ttf", font);
    doc.addFont(name + ".ttf", name, "normal");
  }
  doc.setFont("NotoSans");
  doc.setFontSize(15);
  doc.text(title || "Al Zohra Report", 14, 18);
  doc.setFontSize(9);
  doc.text("Generated " + new Date().toISOString().slice(0, 10), 14, 25);
  const value = (v) =>
    v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  autoTable(doc, {
    startY: 30,
    head: [headers],
    body: data.map((row) => headers.map((h) => value(row[h]))),
    styles: {
      font: "NotoSans",
      fontStyle: "normal",
      fontSize: 8,
      overflow: "linebreak",
      cellPadding: 2,
    },
    headStyles: { fontStyle: "normal" },
    margin: { top: 14, bottom: 18 },
    showHead: "everyPage",
    didParseCell: (cell) => {
      if (/[\u0900-\u097f]/.test(cell.cell.raw))
        cell.cell.styles.font = "NotoHindi";
    },
  });
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setFont("NotoSans");
    doc.setFontSize(8);
    doc.text(
      "Page " + n + " of " + pages,
      14,
      doc.internal.pageSize.getHeight() - 8,
    );
  }
  return doc.output("blob");
}
