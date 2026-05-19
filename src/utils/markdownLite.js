// Minimal markdown → HTML for the contract preview. Just the
// features the template uses: headings (#, ##, ###), tables with
// pipe syntax, **bold** inline, `---` horizontal rules, paragraphs,
// and unordered lists (`- `). Output is sanitized-by-construction:
// we escape any HTML in the source values before substitution.
//
// Not a general-purpose markdown parser. Don't reach for it for
// anything outside the contract.

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Bold + line breaks within a paragraph or table cell.
function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\n/g, '<br/>');
  return out;
}

export function renderContractMarkdown(md) {
  const lines = md.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings — match deepest first so #### isn't shallowed by ###
    if (/^####\s+/.test(line)) { blocks.push(`<h4>${inline(line.replace(/^####\s+/, ''))}</h4>`); i++; continue; }
    if (/^###\s+/.test(line))  { blocks.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`); i++; continue; }
    if (/^##\s+/.test(line))   { blocks.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`); i++; continue; }
    if (/^#\s+/.test(line))    { blocks.push(`<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`); i++; continue; }

    // Horizontal rule
    if (/^---\s*$/.test(line)) { blocks.push('<hr/>'); i++; continue; }

    // Tables — detect `| ... |` followed by `| --- |` separator
    if (/^\|.+\|\s*$/.test(line)) {
      // Header row
      const rows = [splitRow(line)];
      // Check if next line is the separator
      let j = i + 1;
      let hasHeader = false;
      if (j < lines.length && /^\|\s*-+\s*(\|\s*-+\s*)+\|\s*$/.test(lines[j])) {
        hasHeader = true;
        j++;
      }
      while (j < lines.length && /^\|.+\|\s*$/.test(lines[j])) {
        rows.push(splitRow(lines[j]));
        j++;
      }
      const html = `<table>${rows.map((cells, idx) => {
        const tag = hasHeader && idx === 0 ? 'th' : 'td';
        return `<tr>${cells.map(c => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`;
      }).join('')}</table>`;
      blocks.push(html);
      i = j;
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*]\s+/, ''))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Blank line = paragraph break (skip)
    if (/^\s*$/.test(line)) { i++; continue; }

    // Paragraph — collect contiguous non-special lines
    const para = [line];
    let k = i + 1;
    while (k < lines.length && lines[k].trim() && !/^(#{1,3}\s|---|\|.+\||[-*]\s)/.test(lines[k])) {
      para.push(lines[k]);
      k++;
    }
    blocks.push(`<p>${inline(para.join('\n'))}</p>`);
    i = k;
  }

  return blocks.join('\n');
}

function splitRow(line) {
  // Trim outer pipes, split on |, trim each cell.
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(s => s.trim());
}
