import React from "react";

export const HighlightedCode: React.FC<{ code: string; language?: string }> = ({ code, language = "text" }) => {
  const tokens = code.split(/(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|class|new|async|await|import|from|export|default|try|catch|throw|def|True|False|None|public|private|static|void|int|string|boolean|return|select|where|join|as|const|type|interface)\b|\b\d+(?:\.\d+)?\b)/g);
  return <code className={`syntax-code language-${(language || "text").toLowerCase()}`}>{tokens.map((token, index) => {
    let kind = "";
    if (/^(\/\/|#|\/\*)/.test(token)) kind = "comment";
    else if (/^("|'|`)/.test(token)) kind = "string";
    else if (/^\d/.test(token)) kind = "number";
    else if (/^(const|let|var|function|return|if|else|for|while|class|new|async|await|import|from|export|default|try|catch|throw|def|True|False|None|public|private|static|void|int|string|boolean|type|interface|select|where|join|as)$/.test(token)) kind = "keyword";
    return <span className={kind || undefined} key={index}>{token}</span>;
  })}</code>;
};

export const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { setCopied(false); }
  };
  return <div className="markdown-code-block"><div className="markdown-code-toolbar"><span>{language || "code"}</span><button type="button" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button></div><pre><HighlightedCode code={code} language={language} /></pre></div>;
};

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) return <a key={key} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return part;
  });
}

export const MarkdownMessage: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !lines[index].trim().startsWith("```")) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      nodes.push(<CodeBlock key={`code-${index}`} code={code.join("\n")} language={language} />);
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[index + 1])) {
      const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      const headers = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|")) rows.push(cells(lines[index++]));
      nodes.push(<div className="markdown-table-wrap" key={`table-${index}`}><table><thead><tr>{headers.map((cell, i) => <th key={i}>{inline(cell, `th-${index}-${i}`)}</th>)}</tr></thead><tbody>{rows.map((row, ri) => <tr key={ri}>{headers.map((_, ci) => <td key={ci}>{inline(row[ci] || "", `td-${index}-${ri}-${ci}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      nodes.push(React.createElement(`h${level}`, { key: `heading-${index}` }, ...inline(heading[2], `heading-${index}`)));
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      nodes.push(<blockquote key={`quote-${index}`}>{quote.map((row, i) => <React.Fragment key={i}>{i > 0 && <br />}{inline(row, `quote-${index}-${i}`)}</React.Fragment>)}</blockquote>);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: React.ReactNode[] = [];
      while (index < lines.length && (/^\s*[-*+]\s+/.test(lines[index]) || /^\s*\d+[.)]\s+/.test(lines[index]))) {
        const item = lines[index].replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "");
        items.push(<li key={index}>{inline(item, `list-${index}`)}</li>);
        index += 1;
      }
      nodes.push(ordered ? <ol key={`list-${index}`}>{items}</ol> : <ul key={`list-${index}`}>{items}</ul>);
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s|^\s*```|^\s*[-*+]\s|^\s*\d+[.)]\s/.test(lines[index])) paragraph.push(lines[index++]);
    nodes.push(<p key={`p-${index}`}>{paragraph.map((row, i) => <React.Fragment key={i}>{i > 0 && <br />}{inline(row, `p-${index}-${i}`)}</React.Fragment>)}</p>);
  }
  return <div className="markdown-message">{nodes}</div>;
};
