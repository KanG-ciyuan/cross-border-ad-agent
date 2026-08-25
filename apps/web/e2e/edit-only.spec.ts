import { expect, test, type Page, type TestInfo } from "@playwright/test";

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectNoRootOverflow(page: Page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasOverflow).toBe(false);
}

test("edit-only removes generation fields and submits directly to review", async ({ page }, testInfo: TestInfo) => {
  const consoleErrors = collectConsoleErrors(page);
  const taskApiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/tasks")) taskApiRequests.push(`${request.method()} ${request.url()}`);
  });

  await page.goto("/tasks/new?demo=1");
  await page.getByRole("radio", { name: "只剪现有素材" }).check();

  await expect(page.getByLabel("产品名称")).toHaveCount(0);
  await expect(page.getByText("产品与市场")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "生成三视图" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "生成九宫格分镜" })).toHaveCount(0);
  await expect(page.getByText(/不生成三视图、九宫格、AI 视频、新卖点或额外广告文案/)).toBeVisible();
  await expectNoRootOverflow(page);

  await page.getByLabel("上传需要剪辑的视频、图片和音频").setInputFiles({
    name: "existing-footage.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("playwright-existing-video")
  });
  await page.getByRole("checkbox", { name: "转场" }).uncheck();
  await expect(page.getByRole("checkbox", { name: "筛选与裁剪" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "片段拼接" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "字幕" })).toBeChecked();
  await page.getByRole("button", { name: "检查并开始剪辑" }).click();

  await expect(page).toHaveURL(/\/tasks\/tsk_demo0004\/review$/);
  await expect(page.getByRole("heading", { name: "审核广告初版" })).toBeVisible();
  // Demo mode is intentionally in-memory; payload shape is covered by the component test.
  expect(taskApiRequests).toEqual([]);
  await expectNoRootOverflow(page);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("edit-only-review.png"), fullPage: true });
});
