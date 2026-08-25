import { AssetUploader } from "./AssetUploader";

export function CompleteCreationForm({ files, onFiles, references, onReferenceChange }: { files: File[]; onFiles: (files: File[]) => void; references: string[]; onReferenceChange: (values: string[]) => void }) {
  const toggle = (value: string) => onReferenceChange(references.includes(value) ? references.filter((item) => item !== value) : [...references, value]);
  return <>
    <section className="surface"><h2>产品与市场</h2><div className="form-grid"><label>产品名称<input aria-label="产品名称" name="name" defaultValue="KLIN 厨房重油清洁剂" /></label><label>产品品类<select name="category" defaultValue="kitchen_cleaner"><option value="kitchen_cleaner">厨房清洁剂</option></select></label><label>目标市场<select disabled><option>印度尼西亚</option></select></label><label>发布平台<select disabled><option>TikTok · 9:16</option></select></label><label className="full">已确认产品事实<textarea name="facts" defaultValue="500 ml；适用于灶台、抽油烟机等厨房重油表面；喷洒后擦拭使用。" /></label><label>允许使用的卖点<textarea name="claims" defaultValue="帮助软化厨房油污；喷洒方便；适合日常清洁。" /></label><label>禁止或暂不使用的表述<textarea name="prohibited" defaultValue="100%杀菌、无毒、食品级、绝对安全。" /></label></div></section>
    <section className="surface"><h2>产品图片</h2><AssetUploader label="上传产品图片" files={files} onFiles={onFiles} />{files.length > 0 ? <div className="reference-options"><strong>需要生成哪些参考内容</strong><label><input type="checkbox" checked={references.includes("three_view")} onChange={() => toggle("three_view")} />生成三视图</label><label><input type="checkbox" checked={references.includes("nine_grid")} onChange={() => toggle("nine_grid")} />生成九宫格分镜</label><p>来源信息显示在第三步确认界面，不会写入图片内容。</p></div> : null}</section>
  </>;
}
