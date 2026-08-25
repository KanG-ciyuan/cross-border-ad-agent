import { useState, type FormEvent } from "react";
import type { TaskCreateInput } from "@ad-agent/contracts";
import { CompleteCreationForm, type CompleteCreationDraft } from "./CompleteCreationForm";
import { EditOnlyForm } from "./EditOnlyForm";

type Operation = "trim" | "concat" | "captions" | "voiceover" | "stickers" | "transitions" | "music";

export function CreateTaskPage({ onSubmit, onCancel }: { onSubmit: (payload: TaskCreateInput) => void; onCancel: () => void }) {
  const [goal, setGoal] = useState<"complete_creation" | "edit_only">("complete_creation");
  const [completeDraft, setCompleteDraft] = useState<CompleteCreationDraft>({
    inputMode: "product_images",
    name: "KLIN 厨房重油清洁剂",
    category: "kitchen_cleaner",
    facts: "500 ml；适用于灶台、抽油烟机等厨房重油表面；喷洒后擦拭使用。",
    claims: "帮助软化厨房油污；喷洒方便；适合日常清洁。",
    prohibited: "100%杀菌、无毒、食品级、绝对安全。",
    productFiles: [],
    materialFiles: [],
    references: ["three_view", "nine_grid"]
  });
  const [editFiles, setEditFiles] = useState<File[]>([]);
  const [editInstructions, setEditInstructions] = useState("优先保留产品使用过程和清洁前后对比，成片使用 9:16 竖屏。");
  const [operations, setOperations] = useState<Operation[]>(["trim", "concat", "captions", "transitions"]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (goal === "edit_only") return onSubmit({ goal, market: "ID", platform: "tiktok", editInstructions, allowedOperations: operations });
    onSubmit({ goal, market: "ID", platform: "tiktok", inputMode: completeDraft.inputMode, product: { name: completeDraft.name, category: completeDraft.category, facts: [completeDraft.facts], approvedClaims: [completeDraft.claims], prohibitedClaims: [completeDraft.prohibited], usage: "喷洒后擦拭" }, referenceGeneration: completeDraft.references });
  };
  return <form className="page-section" onSubmit={submit}><header className="page-heading"><div><h1>新建产品广告</h1><p>{goal === "complete_creation" ? "创意优先，产品事实和合规要求是不可突破的边界。" : "只执行你勾选的剪辑操作，不扩展任务范围。"}</p></div><button type="button" className="button" onClick={onCancel}>保存草稿</button></header><div className="stepper"><span className="active"><b>1</b>提交资料</span><span><b>2</b>分析素材</span><span><b>3</b>确认方案</span><span><b>4</b>生成审核</span></div><section className="surface"><h2>这次要完成什么</h2><div className="goal-grid"><label className={goal === "complete_creation" ? "choice selected" : "choice"}><input type="radio" name="goal" aria-label="完整广告创作" checked={goal === "complete_creation"} onChange={() => setGoal("complete_creation")} /><strong>完整广告创作</strong><span>完成脚本、参考图、分镜、补镜头和剪辑。</span></label><label className={goal === "edit_only" ? "choice selected" : "choice"}><input type="radio" name="goal" aria-label="只剪现有素材" checked={goal === "edit_only"} onChange={() => setGoal("edit_only")} /><strong>只剪现有素材</strong><span>不生成图片、视频、新卖点或额外文案。</span></label></div></section><div className="create-layout"><div>{goal === "complete_creation" ? <CompleteCreationForm draft={completeDraft} onDraftChange={setCompleteDraft} /> : <EditOnlyForm files={editFiles} onFiles={setEditFiles} instructions={editInstructions} onInstructions={setEditInstructions} selected={operations} onSelected={(values) => setOperations(values as Operation[])} />}</div><aside className="summary-rail"><section className="surface"><h2>本次输出</h2><dl><div><dt>语言</dt><dd>{goal === "complete_creation" ? "印尼语字幕 + 配音" : "按素材与勾选项"}</dd></div><div><dt>画幅</dt><dd>9:16 竖屏</dd></div><div><dt>审核</dt><dd>生成前后均需确认</dd></div></dl></section><button className="button primary wide">{goal === "edit_only" ? "检查并开始剪辑" : "开始分析资料"}</button></aside></div></form>;
}
