import { Package } from "lucide-react";

export function ReferenceGallery() {
  const neutralPreview = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const items = [
    { view: "正面", source: "原始上传", tone: "success", previewClass: "front" },
    { view: "侧面", source: "生成候选", tone: "info", previewClass: "side" },
    { view: "背面", source: "生成候选", tone: "info", previewClass: "back" }
  ];
  return <div className="reference-gallery">{items.map((item) => <article key={item.view}><div className={`reference-image ${item.previewClass}`}><img src={neutralPreview} alt={`产品${item.view}参考图`} /><Package size={42} aria-hidden="true" /></div><div className="reference-meta"><strong>{item.view}</strong><span className={`source-badge ${item.tone}`}>{item.source}</span></div></article>)}</div>;
}
