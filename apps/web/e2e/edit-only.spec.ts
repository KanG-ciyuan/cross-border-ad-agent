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

async function loginThroughUi(page: Page) {
  await page.route("**/api/auth/login", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/tasks/new");
  await expect(page.getByRole("heading", { name: "公司成员登录" })).toBeVisible();
  await page.getByLabel("授权邮箱").fill("qa@company.test");
  await page.getByLabel("密码").fill("not-a-real-password");
  const loginRequest = page.waitForRequest(
    (request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/auth/login"
  );
  await page.getByRole("button", { name: "登录" }).click();
  expect((await loginRequest).postDataJSON()).toEqual({
    email: "qa@company.test",
    password: "not-a-real-password"
  });
}

test("edit-only removes generation fields and submits directly to review", async ({ page }, testInfo: TestInfo) => {
  const consoleErrors = collectConsoleErrors(page);
  await loginThroughUi(page);
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
  await expectNoRootOverflow(page);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("edit-only-review.png"), fullPage: true });
});

test("edit-only task API payload excludes generation, product, claim, and extra-copy fields", async () => {
  test.skip(
    true,
    "Unverified by design: the frontend has no task API integration, so no browser task request exists to assert at the API boundary."
  );
});
