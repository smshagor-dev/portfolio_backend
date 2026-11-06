const fs = require("fs/promises");
const path = require("path");

function normalizeString(value) {
  return String(value || "").trim();
}

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapLine(line, maxChars = 88) {
  const words = String(line || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function applicantHeader() {
  return [
    "Md Shahanur Islam Shagor",
    "Full-Stack Developer & AI Engineer",
    "smshagor.ru@gmail.com  |  +7 995 494 9836  |  www.smshagor.com",
    "github.com/smshagor-dev  |  linkedin.com/in/sm-shagor",
  ];
}

function applicantFooter() {
  return [
    "Sincerely,",
    "",
    "Md Shahanur Islam Shagor",
    "Full-Stack Developer & AI Engineer",
  ];
}

function stripGeneratedLetterChrome(value) {
  return normalizeString(value)
    .replace(/^Md Shahanur Islam Shagor\s*/i, "")
    .replace(/^Full-Stack Developer & AI Engineer\s*/i, "")
    .replace(/^Dear Hiring Team,?\s*/i, "")
    .replace(/^Hello,?\s*/i, "")
    .replace(/Sincerely,?\s*Md Shahanur Islam Shagor\s*(Full-Stack Developer & AI Engineer)?\s*$/i, "")
    .trim();
}

function buildPdfSections({ coverLetterText }) {
  const paragraphs = stripGeneratedLetterChrome(coverLetterText)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return {
    header: applicantHeader(),
    body: paragraphs.flatMap((paragraph) => [...wrapLine(paragraph, 86).map((line) => ({ text: line, justify: true })), { text: "", justify: false }]).slice(0, 50),
    footer: applicantFooter(),
  };
}

function lineWidth(line, fontSize = 11) {
  return String(line || "").length * fontSize * 0.52;
}

function centeredX(line, fontSize = 11, pageWidth = 612) {
  return Math.max(40, Math.round((pageWidth - lineWidth(line, fontSize)) / 2));
}

function justifySpacing(line, fontSize = 11, targetWidth = 512) {
  const words = String(line || "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 4 || line.length < 45) return 0;
  const naturalWidth = lineWidth(line, fontSize);
  if (naturalWidth >= targetWidth) return 0;
  return Math.min(4, Math.max(0, (targetWidth - naturalWidth) / (words.length - 1)));
}

function textAt(line, x, y, { fontSize = 11, wordSpacing = 0 } = {}) {
  return [
    "BT",
    `/F1 ${fontSize} Tf`,
    `${wordSpacing.toFixed(2)} Tw`,
    `${x} ${y} Td`,
    `(${escapePdfText(line)}) Tj`,
    "ET",
  ].join("\n");
}

function buildSimplePdf(sections) {
  const pageHeight = 792;
  let y = 744;
  const parts = [];

  sections.header.forEach((line, index) => {
    const fontSize = index === 0 ? 13 : 10;
    parts.push(textAt(line, centeredX(line, fontSize), y, { fontSize }));
    y -= index === 0 ? 18 : 14;
  });

  y -= 16;
  for (const line of sections.body) {
    if (!line.text) {
      y -= 10;
      continue;
    }
    parts.push(textAt(line.text, 56, y, { fontSize: 11, wordSpacing: line.justify ? justifySpacing(line.text) : 0 }));
    y -= 15;
    if (y < 150) break;
  }

  y = Math.min(y - 10, 130);
  sections.footer.forEach((line) => {
    parts.push(textAt(line, 56, y, { fontSize: 11 }));
    y -= 15;
  });

  const content = parts.join("\n");
  const stream = Buffer.from(content, "utf8");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

async function generateCoverLetterPdf({ draftId, job, profileContext, coverLetterText }) {
  const uploadRoot = path.resolve(process.cwd(), "public", "uploads", "job-agent");
  await fs.mkdir(uploadRoot, { recursive: true });

  const sections = buildPdfSections({
    jobTitle: job?.title,
    company: job?.company,
    coverLetterText,
  });
  const filename = `cover-letter-${draftId}-${Date.now()}.pdf`;
  const filePath = path.join(uploadRoot, filename);
  await fs.writeFile(filePath, buildSimplePdf(sections));

  return {
    publicUrl: `/uploads/job-agent/${filename}`,
    filePath,
  };
}

module.exports = {
  generateCoverLetterPdf,
};
