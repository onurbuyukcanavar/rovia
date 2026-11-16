import { expect, type Page } from "@playwright/test";

export const users = {
  alice: { email: process.env.E2E_ALICE_EMAIL ?? "", password: process.env.E2E_ALICE_PASSWORD ?? "" },
  bob: { email: process.env.E2E_BOB_EMAIL ?? "", password: process.env.E2E_BOB_PASSWORD ?? "" },
};

export const hasCredentials = Boolean(
  users.alice.email && users.alice.password && users.bob.email && users.bob.password,
);

export async function login(page: Page, who: keyof typeof users, next?: string) {
  await page.goto(next ? `/giris?next=${encodeURIComponent(next)}` : "/giris");
  await page.getByLabel("E-posta").fill(users[who].email);
  await page.getByLabel("Şifre", { exact: true }).fill(users[who].password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL(next ?? /\/panel$/);
}
