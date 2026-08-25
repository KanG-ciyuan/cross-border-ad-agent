import { Upload, X } from "lucide-react";

export function AssetUploader({ label, files, onFiles }: { label: string; files: File[]; onFiles: (files: File[]) => void }) {
  return <div className="asset-uploader"><label className="drop-zone"><Upload size={22} /><strong>点击上传或拖入素材</strong><span>{label}</span><input aria-label={label} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" multiple onChange={(event) => onFiles(Array.from(event.target.files ?? []))} /></label>{files.map((file) => <div className="file-row" key={`${file.name}-${file.size}`}><span>{file.name}</span><button type="button" className="icon-button" aria-label={`移除 ${file.name}`} onClick={() => onFiles(files.filter((item) => item !== file))}><X size={15} /></button></div>)}</div>;
}
