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
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
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

test("complete creation reaches a costed final version", async ({ page }, testInfo: TestInfo) => {
  const consoleErrors = collectConsoleErrors(page);
  await loginThroughUi(page);
  await expect(page).toHaveTitle(/AdFlow/);
  await expect(page.getByRole("heading", { name: "新建产品广告" })).toBeVisible();
  await expectNoRootOverflow(page);

  await page.getByLabel("产品名称").fill("KLIN 厨房重油清洁剂 E2E");
  await page.getByLabel("上传产品图片").setInputFiles({
    name: "klin-front.png",
    mimeType: "image/png",
    buffer: Buffer.from("playwright-product-image")
  });
  await expect(page.getByText("生成三视图")).toBeVisible();
  await expect(page.getByText("生成九宫格分镜")).toBeVisible();
  await page.getByRole("button", { name: "开始分析资料" }).click();

  await expect(page.getByRole("heading", { name: "确认 AI 广告方案" })).toBeVisible();
  await expectNoRootOverflow(page);
  await page.getByRole("checkbox", { name: /我已核对候选三视图/ }).check();
  await page.getByRole("checkbox", { name: "分镜顺序和卖点正确" }).check();
  await page.getByRole("checkbox", { name: "同意本任务费用上限" }).check();
  await page.getByRole("checkbox", { name: "了解实验镜头一致性风险" }).check();
  await page.getByRole("button", { name: "确认并生成初版" }).click();

  await expect(page.getByRole("heading", { name: "审核广告初版" })).toBeVisible();
  await expect(page.getByText("模拟生成结果")).toBeVisible();
  await expectNoRootOverflow(page);
  await page.getByRole("button", { name: "重新生成镜头 3" }).click();
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "通过内容审核" }).click();
  await expect(page.getByRole("button", { name: "最终批准" })).toBeEnabled();
  await page.getByRole("button", { name: "最终批准" }).click();

  await expect(page).toHaveURL(/\/versions$/);
  await expect(page.getByRole("heading", { name: "成品与版本" })).toBeVisible();
  await expect(page.getByRole("row", { name: /V3.*¥18\.40/ })).toBeVisible();
  await expectNoRootOverflow(page);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("complete-creation-final.png"), fullPage: true });
});
