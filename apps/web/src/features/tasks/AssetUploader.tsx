import { CircleCheck, RotateCcw, Upload, X } from "lucide-react";
import { useRef } from "react";

const DEFAULT_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"];
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export function getFileSelectionError(file: File, allowedTypes = DEFAULT_TYPES) {
  if (file.size > MAX_FILE_BYTES) return "文件超过 100 MB";
  if (!allowedTypes.includes(file.type)) return "文件类型不支持";
  return undefined;
}

export function AssetUploader({ label, files, onFiles, allowedTypes = DEFAULT_TYPES }: { label: string; files: File[]; onFiles: (files: File[]) => void; allowedTypes?: string[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const removeAt = (index: number) => onFiles(files.filter((_, fileIndex) => fileIndex !== index));
  const retryAt = (index: number) => {
    removeAt(index);
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  };
  return <div className="asset-uploader"><label className="drop-zone"><Upload size={22} /><strong>点击选择或拖入素材</strong><span>{label}</span><input ref={inputRef} aria-label={label} type="file" accept={allowedTypes.join(",")} multiple onChange={(event) => onFiles(Array.from(event.target.files ?? []))} /></label>{files.map((file, index) => {
    const error = getFileSelectionError(file, allowedTypes);
    return <div className={`file-row${error ? " invalid" : ""}`} key={`${file.name}-${file.size}-${file.lastModified}-${index}`}><span className="file-info"><strong>{file.name}</strong><small>{error ?? <><CircleCheck size={13} />已选择，提交任务后上传</>}</small></span><span className="file-actions">{error ? <button type="button" className="icon-button" aria-label={`重新选择 ${file.name}`} title="重新选择" onClick={() => retryAt(index)}><RotateCcw size={15} /></button> : null}<button type="button" className="icon-button" aria-label={`移除 ${file.name}`} title="移除" onClick={() => removeAt(index)}><X size={15} /></button></span></div>;
  })}</div>;
}
