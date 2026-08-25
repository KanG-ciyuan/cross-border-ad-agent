const shots = ["灶台油污特写", "真实产品正面展示", "喷洒清洁动作", "油污软化近景", "抹布擦拭动作", "清洁前后对比", "容量与使用范围", "整洁厨房场景", "产品与行动号召"];
export function StoryboardGrid() {
  return <div className="storyboard-grid">{shots.map((shot, index) => <article key={shot}><div className="shot-visual">{shot}</div><div><strong>{String(index + 1).padStart(2, "0")} {shot}</strong><span>{index % 3 === 1 ? "真实图合成" : "生成场景"} · {index === 8 ? 1 : 3}秒</span></div></article>)}</div>;
}
