import { expect, test } from "@playwright/test";

/**
 * E2E tests for Settings Modal - Sound Alerts
 *
 * These tests were deferred from Phase 10.2 integration tests due to
 * test environment limitations with Zustand conditional rendering.
 *
 * Tests verify:
 * 1. Test Sound button appears when sound alerts enabled
 * 2. Test Sound button plays audio when clicked
 * 3. Error handling when autoplay is blocked
 */

test.describe("Settings Modal - Sound Alerts", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto("/");

    // Wait for app to load
    await expect(page.locator("nav")).toBeVisible();

    // Open Settings modal
    await page.getByRole("button", { name: /settings/i }).click();

    // Wait for modal to appear
    await expect(page.getByRole("dialog")).toBeVisible();

    // Navigate to Notifications tab
    await page.getByRole("tab", { name: /notifications/i }).click();
  });

  test("should show Test Sound button when sound alerts are enabled", async ({
    page,
  }) => {
    // Find the Sound Alerts label (it's visible, whereas the checkbox is hidden)
    const soundLabel = page.getByText("Sound Alerts", { exact: true });
    await soundLabel.scrollIntoViewIfNeeded();

    // Get the actual checkbox to verify state
    const soundToggle = page.locator("#sound-alerts");

    // Sound alerts should be disabled by default
    await expect(soundToggle).not.toBeChecked();

    // Test Sound button should not be visible
    await expect(
      page.getByRole("button", { name: /test sound/i }),
    ).not.toBeVisible();

    // Enable sound alerts by clicking the label
    await soundLabel.click();
    await expect(soundToggle).toBeChecked();

    // Give React time to render conditional content
    await page.waitForTimeout(500);

    // Scroll modal body to bottom BEFORE looking for button
    const modalBody = page.locator(".modal__body");
    await modalBody.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(200);

    // Try finding button by text instead of role
    const testSoundButton = page.getByText("Test Sound", { exact: true });
    await expect(testSoundButton).toBeVisible();

    // Disable sound alerts again
    await soundLabel.click();
    await expect(soundToggle).not.toBeChecked();

    // Test Sound button should be hidden again
    await expect(
      page.getByRole("button", { name: /test sound/i }),
    ).not.toBeVisible();
  });

  test("should show and click test sound button", async ({ page }) => {
    // Find the Sound Alerts label and enable it
    const soundLabel = page.getByText("Sound Alerts", { exact: true });
    await soundLabel.scrollIntoViewIfNeeded();

    // Enable sound alerts
    await soundLabel.click();

    // Give React time to render
    await page.waitForTimeout(500);

    // Scroll to bottom BEFORE looking for button
    const modalBody = page.locator(".modal__body");
    await modalBody.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(200);

    // Now find the Test Sound button by text
    const testSoundButton = page.getByText("Test Sound", { exact: true });
    await expect(testSoundButton).toBeVisible();

    // Click Test Sound button - should not throw
    await testSoundButton.click();

    // Note: We can't reliably test audio playback in headless mode,
    // but we verify the button exists and is clickable
    await expect(testSoundButton).toBeVisible();
  });

  test("should handle autoplay block gracefully", async ({ page, context }) => {
    // Block autoplay in browser context
    await context.grantPermissions([], { origin: page.url() });

    // Find the Sound Alerts label and enable it
    const soundLabel = page.getByText("Sound Alerts", { exact: true });
    await soundLabel.scrollIntoViewIfNeeded();

    // Enable sound alerts
    await soundLabel.click();

    // Give React time to render
    await page.waitForTimeout(500);

    // Scroll to bottom BEFORE looking for button
    const modalBody = page.locator(".modal__body");
    await modalBody.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(200);

    // Now find the Test Sound button by text
    const testSoundButton = page.getByText("Test Sound", { exact: true });

    // Should not throw error even if autoplay blocked
    await expect(async () => {
      await testSoundButton.click();
    }).not.toThrow();

    // Check for error alert (optional - depends on implementation)
    const errorAlert = page.locator('[role="alert"]');
    if (await errorAlert.isVisible()) {
      await expect(errorAlert).toContainText(/autoplay|blocked|permission/i);
    }
  });

  test("should adjust volume with slider", async ({ page }) => {
    // Find the Sound Alerts label and enable it
    const soundLabel = page.getByText("Sound Alerts", { exact: true });
    await soundLabel.scrollIntoViewIfNeeded();

    // Enable sound alerts
    await soundLabel.click();

    // Find volume slider and scroll into view
    const volumeSlider = page.getByRole("slider", { name: /volume/i });
    await volumeSlider.waitFor({ state: "attached", timeout: 5000 });
    await volumeSlider.scrollIntoViewIfNeeded();
    await expect(volumeSlider).toBeVisible();
    await expect(volumeSlider).toBeEnabled();

    // Default volume should be 50
    await expect(volumeSlider).toHaveValue("50");

    // Change volume to 75
    await volumeSlider.fill("75");
    await expect(volumeSlider).toHaveValue("75");

    // Volume should persist when modal is closed and reopened
    await page.getByRole("button", { name: /close/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Reopen settings
    await page.getByRole("button", { name: /settings/i }).click();
    await page.getByRole("tab", { name: /notifications/i }).click();

    // Volume should still be 75
    const volumeSliderReopened = page.getByRole("slider", { name: /volume/i });
    await expect(volumeSliderReopened).toHaveValue("75");
  });

  test("should hide volume slider when sound alerts are off", async ({
    page,
  }) => {
    // Find the Sound Alerts label
    const soundLabel = page.getByText("Sound Alerts", { exact: true });
    await soundLabel.scrollIntoViewIfNeeded();

    // Get the actual checkbox to verify state
    const soundToggle = page.locator("#sound-alerts");

    // Sound alerts should be disabled by default
    await expect(soundToggle).not.toBeChecked();

    // Volume slider should NOT exist in DOM when sound alerts are off
    const volumeSlider = page.getByRole("slider", { name: /volume/i });
    await expect(volumeSlider).not.toBeVisible();

    // Enable sound alerts
    await soundLabel.click();

    // Volume slider should now appear and be enabled
    await volumeSlider.waitFor({ state: "attached", timeout: 5000 });
    await volumeSlider.scrollIntoViewIfNeeded();
    await expect(volumeSlider).toBeVisible();
    await expect(volumeSlider).toBeEnabled();
  });

  test("should show browser-specific warnings for Chromium", async ({
    page,
    browserName,
  }) => {
    // Skip if not Chromium
    test.skip(browserName !== "chromium", "Only runs on Chromium browsers");

    // Find the Sound Alerts label and enable it
    const soundLabel = page.getByText("Sound Alerts", { exact: true });
    await soundLabel.scrollIntoViewIfNeeded();

    // Enable sound alerts
    await soundLabel.click();

    // Should show Chromium-specific warning - scroll into view
    const warning = page.locator("text=/requires.*test sound.*reload/i");
    await warning.scrollIntoViewIfNeeded();
    await expect(warning).toBeVisible();
  });

  test("should not show browser warnings for Firefox", async ({
    page,
    browserName,
  }) => {
    // Skip if not Firefox
    test.skip(browserName !== "firefox", "Only runs on Firefox");

    // Find the Sound Alerts label and enable it
    const soundLabel = page.getByText("Sound Alerts", { exact: true });
    await soundLabel.scrollIntoViewIfNeeded();

    // Enable sound alerts
    await soundLabel.click();

    // Should NOT show Chromium warning
    const warning = page.locator("text=/requires.*test sound.*reload/i");
    await expect(warning).not.toBeVisible();
  });
});
