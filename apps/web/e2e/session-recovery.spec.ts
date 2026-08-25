import { expect, test, type Page, type TestInfo } from "@playwright/test";

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("a fresh demo context can recover a directly addressed built-in review route", async ({ page }, testInfo: TestInfo) => {
  const consoleErrors = collectConsoleErrors(page);

  await page.goto("/tasks/tsk_demo0002/review?demo=1");
  await expect(page.getByRole("heading", { name: "审核广告初版" })).toBeVisible();
  await expect(page.getByText("版本 V3 · 26秒 · 模拟生成结果")).toBeVisible();
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasOverflow).toBe(false);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("fresh-context-built-in-review.png"), fullPage: true });
});

test("a newly created task persists across fresh browser contexts and devices", async () => {
  test.skip(
    true,
    "Unverified by design: the Vite demo stores created tasks and approvals only in React memory and does not call the D1-backed API."
  );
});
