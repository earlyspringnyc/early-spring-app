import T from '../../theme/tokens.js';

function DocViewer({ doc, onClose }) {
  if (!doc) return null;
  const isImage = doc.fileData?.startsWith("data:image");
  const isPdf = doc.fileData?.startsWith("data:application/pdf") || doc.fileName?.endsWith(".pdf");

  return <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.8)", backdropFilter: "blur(8px)" }} onClick={onClose}>
    <div className="slide-in" onClick={e => e.stopPropagation()} style={{ width: "90vw", maxWidth: 900, height: "85vh", borderRadius: T.r, background: T.bg, border: `1px solid ${T.border}`, boxShadow: "0 24px 80px rgba(0,0,0,.5)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.cream }}>{doc.name || doc.fileName || "Document"}</div>
          {doc.fileName && <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>{doc.fileName}</div>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {doc.fileData && <a href={doc.fileData} download={doc.fileName || doc.name || "document"} style={{ padding: "6px 14px", borderRadius: T.rS, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.sans, textDecoration: "none" }}>Download</a>}
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: T.dim, fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }}>×</button>
        </div>
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", background: "#111" }}>
        {isImage && <img src={doc.fileData} alt={doc.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />}
        {isPdf && <iframe src={doc.fileData} style={{ width: "100%", height: "100%", border: "none" }} title={doc.name} />}
        {!isImage && !isPdf && doc.fileData && <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, opacity: .2, marginBottom: 16 }}>▧</div>
          <div style={{ fontSize: 14, color: T.cream, marginBottom: 8 }}>{doc.name || doc.fileName}</div>
          <p style={{ fontSize: 12, color: T.dim, marginBottom: 16 }}>Preview not available for this file type</p>
          <a href={doc.fileData} download={doc.fileName || doc.name || "document"} style={{ padding: "10px 24px", borderRadius: T.rS, border: "none", background: `linear-gradient(135deg,${T.gold},#E8D080)`, color: T.brown, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.sans, textDecoration: "none" }}>Download File</a>
        </div>}
        {!doc.fileData && <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, opacity: .2, marginBottom: 16 }}>▧</div>
          <p style={{ fontSize: 12, color: T.dim }}>No file attached to this document</p>
        </div>}
      </div>
    </div>
  </div>;
}

export default DocViewer;
