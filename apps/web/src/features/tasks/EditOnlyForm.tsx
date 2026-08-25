import { AssetUploader } from "./AssetUploader";

const operations = [["trim", "筛选与裁剪"], ["concat", "片段拼接"], ["captions", "字幕"], ["transitions", "转场"], ["stickers", "贴纸"], ["music", "背景音乐"]] as const;
export function EditOnlyForm({ files, onFiles, selected, onSelected }: { files: File[]; onFiles: (files: File[]) => void; selected: string[]; onSelected: (values: string[]) => void }) {
  const toggle = (value: string) => onSelected(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  return <section className="surface"><h2>现有素材包</h2><AssetUploader label="上传需要剪辑的视频、图片和音频" files={files} onFiles={onFiles} /><label className="field-block">剪辑要求<textarea aria-label="剪辑要求" defaultValue="优先保留产品使用过程和清洁前后对比，成片使用 9:16 竖屏。" /></label><fieldset className="check-options"><legend>允许执行的操作</legend>{operations.map(([value, label]) => <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => toggle(value)} />{label}</label>)}</fieldset><div className="notice success"><strong>不会执行</strong><p>不生成三视图、九宫格、AI 视频、新卖点或额外广告文案。</p></div></section>;
}
