import { useState, type FormEvent } from "react";
import type { TaskCreateInput } from "@ad-agent/contracts";
import { CompleteCreationForm, type CompleteCreationDraft } from "./CompleteCreationForm";
import { EditOnlyForm } from "./EditOnlyForm";

export function CreateTaskPage({ onSubmit, onCancel }: { onSubmit: (payload: TaskCreateInput, files: File[]) => void | Promise<void>; onCancel: () => void }) {
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
  const [editDuration, setEditDuration] = useState<number | "">("");
  const [editRatio, setEditRatio] = useState<"9:16" | "16:9">("9:16");
  const [muteOriginalAudio, setMuteOriginalAudio] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (goal === "edit_only") {
        if (editDuration === "") return;
        await onSubmit({ goal, market: "ID", platform: "tiktok", editInstructions, targetDurationSeconds: editDuration, ratio: editRatio, muteOriginalAudio, subtitleLanguage: "id-ID", voiceoverLanguage: "id-ID" }, editFiles);
        return;
      }
      const files = [...completeDraft.productFiles, ...completeDraft.materialFiles];
      await onSubmit({ goal, market: "ID", platform: "tiktok", inputMode: completeDraft.inputMode, product: { name: completeDraft.name, category: completeDraft.category, facts: [completeDraft.facts], approvedClaims: [completeDraft.claims], prohibitedClaims: [completeDraft.prohibited], usage: "喷洒后擦拭" }, referenceGeneration: completeDraft.references }, files);
    } finally {
      setSubmitting(false);
    }
  };
  return <form className="page-section" onSubmit={submit}><header className="page-heading"><div><h1>新建产品广告</h1><p>{goal === "complete_creation" ? "创意优先，产品事实和合规要求是不可突破的边界。" : "用自然语言描述你想要的成片，Agent 会先理解素材并制定剪辑方案。"}</p></div><button type="button" className="button" onClick={onCancel}>保存草稿</button></header><div className="stepper"><span className="active"><b>1</b>提交资料</span><span><b>2</b>分析素材</span><span><b>3</b>确认方案</span><span><b>4</b>生成审核</span></div><section className="surface"><h2>这次要完成什么</h2><div className="goal-grid"><label className={goal === "complete_creation" ? "choice selected" : "choice"}><input type="radio" name="goal" aria-label="完整广告创作" checked={goal === "complete_creation"} onChange={() => setGoal("complete_creation")} /><strong>完整广告创作</strong><span>完成脚本、参考图、分镜、补镜头和剪辑。</span></label><label className={goal === "edit_only" ? "choice selected" : "choice"}><input type="radio" name="goal" aria-label="只剪现有素材" checked={goal === "edit_only"} onChange={() => setGoal("edit_only")} /><strong>只剪现有素材</strong><span>只根据你提供的素材和自然语言要求进行分析与剪辑。</span></label></div></section><div className="create-layout"><div>{goal === "complete_creation" ? <CompleteCreationForm draft={completeDraft} onDraftChange={setCompleteDraft} /> : <EditOnlyForm files={editFiles} onFiles={setEditFiles} duration={editDuration} onDuration={setEditDuration} instructions={editInstructions} onInstructions={setEditInstructions} mute={muteOriginalAudio} onMute={setMuteOriginalAudio} />}</div><aside className="summary-rail"><section className="surface"><h2>本次输出</h2><dl><div><dt>语言</dt><dd>{goal === "complete_creation" ? "印尼语字幕 + 配音" : "由 Agent 根据要求判断"}</dd></div><div><dt>画幅</dt><dd>{goal === "complete_creation" ? "由脚本决定" : <select aria-label="目标画幅" value={editRatio} onChange={(event) => setEditRatio(event.target.value as "9:16" | "16:9")}><option value="9:16">9:16 竖屏</option><option value="16:9">16:9 横屏</option></select>}</dd></div><div><dt>时长</dt><dd>{goal === "edit_only" ? editDuration === "" ? "待填写" : `${editDuration} 秒` : "按脚本"}</dd></div><div><dt>原声</dt><dd>{goal === "edit_only" && muteOriginalAudio ? "根据你的要求移除" : "由 Agent 判断"}</dd></div><div><dt>审核</dt><dd>先确认剪辑方案，再生成成片</dd></div></dl></section><button className="button primary wide" disabled={submitting || (goal === "edit_only" && editDuration === "")}>{submitting ? "正在创建任务" : goal === "edit_only" ? "提交并分析素材" : "开始分析资料"}</button></aside></div></form>;
}
