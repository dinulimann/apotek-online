import { expect, test, type Browser, type Page } from "@playwright/test";

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(String(e)));
  // Browsers log every 4xx; the app expects some (the signed-out session check, validation errors).
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text()); });
});
test.afterEach(() => expect(errors).toEqual([]));

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/#/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
}

async function address(page: Page) {
  await page.getByLabel("Mobile number").fill("081234567890");
  await page.getByLabel("Address").fill("Jl. Melati No. 5, Kebayoran Baru");
  await page.getByLabel("City").fill("Jakarta Selatan");
  await page.getByLabel("Postal code").fill("12160");
}

test("search and filter the catalogue", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("search").first().getByLabel("Search medicines").fill("vitamin");
  await page.getByRole("search").first().getByLabel("Search medicines").press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Results for “vitamin”");
  await expect(page.getByTestId("results").getByRole("article")).toHaveCount(3);
  await page.goto("/#/shop");
  await page.getByRole("button", { name: "Prescription", exact: true }).click();
  await expect(page.getByTestId("results").getByRole("article")).toHaveCount(5);
  await expect(page.getByTestId("results").getByText("Needs prescription")).toHaveCount(5);
});

test("a limited medicine stops at its per-order cap", async ({ page }) => {
  await page.goto("/#/p/cetirizine-10");
  await expect(page.getByText("Limited to 2 per order")).toBeVisible();
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("button", { name: "More" })).toBeDisabled();
  await page.getByRole("button", { name: /^Add to cart/ }).click();
  await expect(page.getByTestId("cart")).toContainText("Limited to 2 per order");
  await expect(page.getByRole("button", { name: "One more Cetirizine 10 mg" })).toBeDisabled();
});

test("order everyday medicine and pay", async ({ page }) => {
  await signIn(page, "budi@example.com", "demo1234");
  await page.goto("/#/p/paracetamol-500");
  await page.getByRole("button", { name: /^Add to cart/ }).click();
  await page.getByRole("button", { name: "Checkout" }).click();
  await address(page);
  await expect(page.getByTestId("total")).toHaveText("Rp 23.000"); // 8.000 + 15.000 delivery
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText("Waiting for payment")).toBeVisible();
  await page.getByRole("button", { name: /Pay now/ }).click();
  await expect(page.getByText("Paid, being packed")).toBeVisible();
  await expect(page.getByText(/batch PAR-/)).toBeVisible();
});

async function pharmacistPage(browser: Browser) {
  const p = await (await browser.newContext()).newPage();
  await signIn(p, "apoteker@teduh.example", "apoteker123");
  return p;
}

test("prescription medicine waits for the pharmacist, then can be paid", async ({ page, browser }) => {
  await signIn(page, "sari@example.com", "demo1234");
  await page.goto("/#/p/salbutamol-inhaler");
  await expect(page.getByText("Prescription medicine.")).toBeVisible();
  await page.getByRole("button", { name: /^Add to cart/ }).click();
  await page.getByRole("button", { name: "Checkout" }).click();
  await address(page);
  await expect(page.getByRole("button", { name: "Send to pharmacist" })).toBeDisabled();
  await page.getByLabel("Prescription file").setInputFiles("../backend/src/main/resources/demo/sample-prescription.png");
  await expect(page.getByTestId("rx-uploaded")).toBeVisible();
  await page.getByRole("button", { name: "Send to pharmacist" }).click();
  await expect(page.getByText("A pharmacist is checking your prescription.")).toBeVisible();
  const number = (await page.getByRole("heading", { level: 1 }).textContent())!;

  const apt = await pharmacistPage(browser);
  await apt.goto(`/#/admin/review/${number}`);
  await expect(apt.getByTestId("rx-image")).toBeVisible();
  await expect(apt.getByRole("button", { name: "Reject" })).toBeDisabled(); // a reason is required
  await apt.getByRole("button", { name: "Approve" }).click();
  await expect(apt.getByText(`${number} approved`)).toBeVisible();

  await expect(page.getByText("Waiting for payment").first()).toBeVisible({ timeout: 10_000 }); // the page polls
  await page.getByRole("button", { name: /Pay now/ }).click();
  await expect(page.getByText("Paid, being packed")).toBeVisible();
});

test("a rejected prescription tells the customer why", async ({ page, browser }) => {
  const apt = await pharmacistPage(browser);
  await apt.goto("/#/admin/review");
  await expect(apt.getByTestId("rx-image")).toBeVisible();
  await apt.getByPlaceholder(/older than 30 days/).fill("The prescription is not signed by the doctor");
  await apt.getByRole("button", { name: "Reject" }).click();
  await expect(apt.getByText(/rejected; stock returned/)).toBeVisible();

  await signIn(page, "sari@example.com", "demo1234");
  await page.goto("/#/orders");
  await page.getByText("Prescription not accepted").first().click();
  await expect(page.getByText("The prescription is not signed by the doctor").first()).toBeVisible();
});

test("the pharmacist ships a paid order and handles expired stock", async ({ browser }) => {
  const apt = await pharmacistPage(browser);
  await apt.goto("/#/admin/orders?status=PAID");
  await apt.getByRole("table", { name: "Orders" }).getByRole("row").nth(1).click();
  await apt.getByLabel("Courier tracking number").fill("JNE-0099887766");
  await apt.getByRole("button", { name: "Mark as shipped" }).click();
  await expect(apt.getByText(/shipped$/)).toBeVisible();

  await apt.goto("/#/admin/inventory");
  const expiring = apt.getByRole("region", { name: "Expiring soon" });
  await expect(expiring).toContainText("expired 10 days ago");
  await expiring.getByRole("button", { name: "Write off" }).click();
  await expect(apt.getByText("Expired stock written off")).toBeVisible();
  await expect(expiring).not.toContainText("expired 10 days ago");
});

test("register, and customers stay out of the pharmacist desk", async ({ page }) => {
  await page.goto("/#/register");
  await page.getByLabel("Full name").fill("Nina");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("at least 8 characters").or(page.getByText("must be 8 to 72 characters"))).toBeVisible();
  await page.getByLabel("Email").fill(`nina${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("rahasia-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
  await expect(page).toHaveURL(/#\/$/); // registration lands on the home page
  await page.goto("/#/admin");
  await expect(page.getByText("This area is for pharmacists.")).toBeVisible();
});
