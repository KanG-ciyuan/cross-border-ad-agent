import { AssetUploader, getFileSelectionError } from "./AssetUploader";

export type InputMode = "video" | "product_images" | "mixed";
export type ReferenceChoice = "three_view" | "nine_grid";
export type CompleteCreationDraft = {
  inputMode: InputMode;
  name: string;
  category: string;
  facts: string;
  claims: string;
  prohibited: string;
  productFiles: File[];
  materialFiles: File[];
  references: ReferenceChoice[];
};

const PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function CompleteCreationForm({ draft, onDraftChange }: { draft: CompleteCreationDraft; onDraftChange: (draft: CompleteCreationDraft) => void }) {
  const update = <K extends keyof CompleteCreationDraft>(key: K, value: CompleteCreationDraft[K]) => onDraftChange({ ...draft, [key]: value });
  const toggle = (value: ReferenceChoice) => update("references", draft.references.includes(value) ? draft.references.filter((item) => item !== value) : [...draft.references, value]);
  const hasReadyProductImage = draft.productFiles.some((file) => !getFileSelectionError(file, PRODUCT_IMAGE_TYPES));
  return <>
    <section className="surface"><h2>产品与市场</h2><div className="form-grid"><label>产品名称<input aria-label="产品名称" name="name" value={draft.name} onChange={(event) => update("name", event.target.value)} /></label><label>产品品类<select name="category" value={draft.category} onChange={(event) => update("category", event.target.value)}><option value="kitchen_cleaner">厨房清洁剂</option></select></label><label>目标市场<select disabled><option>印度尼西亚</option></select></label><label>发布平台<select disabled><option>TikTok · 9:16</option></select></label><label className="full">已确认产品事实<textarea name="facts" value={draft.facts} onChange={(event) => update("facts", event.target.value)} /></label><label>允许使用的卖点<textarea name="claims" value={draft.claims} onChange={(event) => update("claims", event.target.value)} /></label><label>禁止或暂不使用的表述<textarea name="prohibited" value={draft.prohibited} onChange={(event) => update("prohibited", event.target.value)} /></label></div></section>
    <section className="surface"><h2>输入素材</h2><fieldset className="input-mode-grid"><legend>选择已有的素材类型</legend>{([[
      "product_images", "产品图片", "以产品图生成参考图和广告"
    ], ["video", "现有视频或素材包", "使用现有视频或其他可用素材"], ["mixed", "混合输入", "同时使用产品图与现有素材"]] as const).map(([value, label, description]) => <label className={draft.inputMode === value ? "choice selected" : "choice"} key={value}><input type="radio" name="inputMode" aria-label={label} checked={draft.inputMode === value} onChange={() => update("inputMode", value)} /><strong>{label}</strong><span>{description}</span></label>)}</fieldset></section>
    {draft.inputMode !== "video" ? <section className="surface"><h2>产品图片</h2><AssetUploader label="上传产品图片" files={draft.productFiles} onFiles={(files) => update("productFiles", files)} allowedTypes={PRODUCT_IMAGE_TYPES} />{hasReadyProductImage ? <div className="reference-options"><strong>需要生成哪些参考内容</strong><label><input type="checkbox" checked={draft.references.includes("three_view")} onChange={() => toggle("three_view")} />生成三视图</label><label><input type="checkbox" checked={draft.references.includes("nine_grid")} onChange={() => toggle("nine_grid")} />生成九宫格分镜</label><p>来源信息显示在第三步确认界面，不会写入图片内容。</p></div> : null}</section> : null}
    {draft.inputMode !== "product_images" ? <section className="surface"><h2>现有视频与素材</h2><AssetUploader label="上传现有视频或素材包" files={draft.materialFiles} onFiles={(files) => update("materialFiles", files)} /></section> : null}
  </>;
}
