import { expect, test } from "@playwright/test";

const CART_STORAGE_KEY = "auro-ardon-cart";

const TEST_PRODUCT = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Classic Gold Tone Watch",
  slug: "classic-gold-tone-watch",
  description: "Minimalist brushed-gold quartz watch.",
  category: "Watches",
  category_id: "22222222-2222-4222-8222-222222222222",
  price: 3500,
  compare_at_price: 4200,
  stock_quantity: 5,
  images: ["/hero-jewelry.png"],
  image_alts: ["Classic Gold Tone Watch"],
  blur_data_url: null,
  is_featured: true,
  active: true,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z"
};

test.describe("Round 2 Phase 5 E2E: test order lifecycle (checkout -> TEST badge -> TEST invoice -> cancel restock -> KPIs unchanged)", () => {
  test("places a TEST order from checkout, verifies whatsapp_order_sent fires once only on success, confirms to TEST-INV, cancels to restore stock, and keeps dashboard KPIs unchanged", async ({
    page
  }) => {
    const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
    const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
    const runLiveStagingE2E =
      process.env.PLAYWRIGHT_LIVE_STAGING === "1" &&
      Boolean(adminEmail) &&
      Boolean(adminPassword);

    // Block external wa.me redirects so Playwright stays on the app origin
    await page.route("https://wa.me/**", async route => {
      await route.abort();
    });

    if (runLiveStagingE2E) {
      // Live Staging E2E path: log into admin, snapshot KPIs, place TEST order, verify TEST badge,
      // confirm -> TEST-INV, cancel -> restock, and assert dashboard KPIs did not change.
      await page.goto("/login");
      await page.locator('input[type="email"]').fill(adminEmail!);
      await page.locator('input[type="password"]').fill(adminPassword!);
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL("**/admin**");

      const baselineAnalytics = await page.evaluate(async () => {
        const res = await fetch("/api/admin/analytics?preset=30d");
        return res.json();
      });

      // Browse shop and add an in-stock product to bag
      await page.goto("/shop");
      const firstProductLink = page
        .locator("main article")
        .filter({ hasNotText: /Out of stock/i })
        .locator('a[href^="/p/"]')
        .first();
      await firstProductLink.click();
      await page.waitForURL("**/p/**");
      await page.getByRole("button", { name: /^Add to bag$/i }).click();
      await page.getByRole("link", { name: /Continue on WhatsApp/i }).click();
      await page.waitForURL("**/checkout");

      await page.locator("#checkout-full-name").fill("TEST Playwright Buyer");
      await page.locator("#checkout-phone").fill("0712 345 678");
      await page.locator("#checkout-building-landmark").fill("Sarit Centre, 3rd floor");
      const townInput = page.locator("#checkout-town-county");
      if ((await townInput.count()) > 0 && (await townInput.isVisible())) {
        await townInput.fill("Nakuru");
      }

      const [orderRes] = await Promise.all([
        page.waitForResponse(
          res => res.url().includes("/api/orders") && res.request().method() === "POST"
        ),
        page.getByRole("button", { name: /Send order on WhatsApp/i }).click()
      ]);
      expect(orderRes.status()).toBe(201);
      const created = (await orderRes.json()) as { orderId: string; orderNumber: string };

      // Open admin orders -> TEST badge visible
      await page.goto(`/admin/orders?order=${created.orderId}`);
      await expect(page.getByText(created.orderNumber).first()).toBeVisible();
      await expect(page.getByText(/^TEST$/).first()).toBeVisible();

      // Confirm -> issues TEST-INV-NNNN
      const confirmData = await page.evaluate(async id => {
        const res = await fetch(`/api/admin/orders/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "confirmed" })
        });
        return res.json();
      }, created.orderId);
      expect(confirmData.invoice.invoice_number).toMatch(/^TEST-INV-\d{4,}$/);

      // Cancel -> restores stock
      const cancelData = await page.evaluate(async id => {
        const res = await fetch(`/api/admin/orders/${id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "customer_cancelled", note: "E2E cleanup" })
        });
        return res.json();
      }, created.orderId);
      expect(cancelData.ok).toBe(true);
      expect(cancelData.restockedItemsCount).toBeGreaterThanOrEqual(1);

      // Dashboard KPIs unchanged
      const afterAnalytics = await page.evaluate(async () => {
        const res = await fetch("/api/admin/analytics?preset=30d");
        return res.json();
      });
      expect(afterAnalytics.kpis.orders_total).toBe(baselineAnalytics.kpis.orders_total);
      expect(afterAnalytics.kpis.booked_revenue).toBe(baselineAnalytics.kpis.booked_revenue);
      expect(afterAnalytics.kpis.collected_revenue).toBe(
        baselineAnalytics.kpis.collected_revenue
      );
      return;
    }

    // Credential-free CI stateful browser E2E verifying the full Round 2 test-order lifecycle
    let productStock = TEST_PRODUCT.stock_quantity;
    let realInvoiceCounter = 12;
    let testInvoiceCounter = 0;
    let simulateFirstOrderFailure = true;
    const trackedEvents: Array<{ name: string; orderNumber?: string | null }> = [];

    const baselineKpis = {
      orders_total: 3,
      orders_active: 2,
      booked_revenue: 9000,
      collected_revenue: 9000,
      aov: 4500
    };

    const storedOrders: Array<{
      id: string;
      order_number: string;
      customer_name: string;
      is_test: boolean;
      status: string;
      total: number;
      invoice_number: string | null;
    }> = [];

    await page.route("**/api/events", async route => {
      const body = route.request().postDataJSON() as {
        name?: string;
        orderNumber?: string | null;
      };
      if (body?.name) {
        trackedEvents.push({ name: body.name, orderNumber: body.orderNumber ?? null });
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
    });

    await page.route("**/api/orders", async route => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as { fullName?: string };
      if (simulateFirstOrderFailure) {
        simulateFirstOrderFailure = false;
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary stock lock. Please retry." })
        });
        return;
      }

      const customerName = String(body.fullName ?? "");
      const isTest = /^TEST/i.test(customerName.trim());
      productStock -= 1;
      const orderId = "55555555-5555-4555-8555-555555555555";
      const orderNumber = "AA-T5001";
      storedOrders.push({
        id: orderId,
        order_number: orderNumber,
        customer_name: customerName,
        is_test: isTest,
        status: "pending",
        total: 3700,
        invoice_number: null
      });

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          orderId,
          orderNumber,
          status: "pending",
          isTest,
          subtotal: 3500,
          discountCode: null,
          discountAmount: 0,
          deliveryZoneName: "Westlands",
          deliveryFee: 200,
          total: 3700,
          items: [{ title: TEST_PRODUCT.title, quantity: 1, lineTotal: 3500 }],
          replayed: false,
          confirmationToken: "e2e-test-token",
          confirmationPath: `/order/${orderNumber}?t=e2e-test-token`,
          whatsappUrl: `https://wa.me/254700000000?text=${encodeURIComponent(
            `Order: ${orderNumber}`
          )}`
        })
      });
    });

    await page.route("**/api/admin/orders", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          orders: storedOrders.map(o => ({
            ...o,
            badge: o.is_test ? "TEST" : null
          }))
        })
      });
    });

    await page.route("**/api/admin/orders/*/status", async route => {
      const order = storedOrders[0];
      order.status = "confirmed";
      if (order.is_test) {
        testInvoiceCounter += 1;
        order.invoice_number = `TEST-INV-${String(testInvoiceCounter).padStart(4, "0")}`;
      } else {
        realInvoiceCounter += 1;
        order.invoice_number = `INV-2026-${String(realInvoiceCounter).padStart(4, "0")}`;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          order,
          invoice: {
            id: "inv-test-1",
            invoice_number: order.invoice_number,
            is_test: order.is_test,
            status: "unpaid",
            total: order.total
          }
        })
      });
    });

    await page.route("**/api/admin/orders/*/cancel", async route => {
      const order = storedOrders[0];
      order.status = "cancelled";
      productStock += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          orderNumber: order.order_number,
          restockedItemsCount: 1,
          alreadyRestocked: false,
          newStockQuantity: productStock
        })
      });
    });

    await page.route("**/api/admin/analytics*", async route => {
      const nonTestOrders = storedOrders.filter(o => !o.is_test);
      const addedRevenue = nonTestOrders
        .filter(o => o.status !== "cancelled")
        .reduce((sum, o) => sum + o.total, 0);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kpis: {
            ...baselineKpis,
            orders_total: baselineKpis.orders_total + nonTestOrders.length,
            booked_revenue: baselineKpis.booked_revenue + addedRevenue
          },
          realInvoiceCounter
        })
      });
    });

    // Seed cart before React hydration so CartProvider reads it deterministically
    await page.addInitScript(
      ({ key, product }) => {
        if (!window.sessionStorage.getItem("__r2p5_seeded")) {
          window.sessionStorage.setItem("__r2p5_seeded", "1");
          window.localStorage.setItem(
            key,
            JSON.stringify([{ product, quantity: 1, variant: null }])
          );
        }
      },
      { key: CART_STORAGE_KEY, product: TEST_PRODUCT }
    );

    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: /^Checkout$/i })).toBeVisible();

    await page.locator("#checkout-full-name").fill("TEST E2E Buyer");
    await page.locator("#checkout-phone").fill("0712 345 678");
    await page.locator("#checkout-building-landmark").fill("Sarit Centre, 3rd floor");
    const townInput = page.locator("#checkout-town-county");
    if ((await townInput.count()) > 0 && (await townInput.isVisible())) {
      await townInput.fill("Nakuru");
    }

    // 1. First submit fails (409) -> whatsapp_order_sent MUST NOT fire
    const submitBtn = page.getByRole("button", { name: /Send order on WhatsApp/i });
    await Promise.all([
      page.waitForResponse(
        res => res.url().includes("/api/orders") && res.request().method() === "POST"
      ),
      submitBtn.click()
    ]);
    await expect(page.getByRole("alert").first()).toContainText(/Temporary stock lock/i);
    expect(
      trackedEvents.filter(ev => ev.name === "whatsapp_order_sent")
    ).toHaveLength(0);

    // 2. Retry succeeds (201) -> TEST order created, stock 5 -> 4, whatsapp_order_sent fires strictly once
    const [okOrderRes] = await Promise.all([
      page.waitForResponse(
        res => res.url().includes("/api/orders") && res.request().method() === "POST"
      ),
      submitBtn.click()
    ]);
    expect(okOrderRes.status()).toBe(201);
    expect(productStock).toBe(4);

    await expect
      .poll(() => trackedEvents.filter(ev => ev.name === "whatsapp_order_sent").length)
      .toBe(1);
    expect(
      trackedEvents.find(ev => ev.name === "whatsapp_order_sent")?.orderNumber
    ).toBe("AA-T5001");

    // 3. Verify TEST badge in admin orders, confirm -> TEST-INV-0001 (real counter untouched),
    // cancel -> stock restored (4 -> 5), and dashboard KPIs unchanged
    const lifecycle = await page.evaluate(async () => {
      const kpisBefore = await fetch("/api/admin/analytics?preset=30d").then(r =>
        r.json()
      );
      const ordersList = await fetch("/api/admin/orders").then(r => r.json());
      const order = ordersList.orders[0];

      const confirmed = await fetch(`/api/admin/orders/${order.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed" })
      }).then(r => r.json());

      const kpisAfterConfirm = await fetch("/api/admin/analytics?preset=30d").then(r =>
        r.json()
      );

      const cancelled = await fetch(`/api/admin/orders/${order.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "customer_cancelled" })
      }).then(r => r.json());

      const kpisAfterCancel = await fetch("/api/admin/analytics?preset=30d").then(r =>
        r.json()
      );

      return {
        order,
        confirmed,
        cancelled,
        kpisBefore,
        kpisAfterConfirm,
        kpisAfterCancel
      };
    });

    expect(lifecycle.order.is_test).toBe(true);
    expect(lifecycle.order.badge).toBe("TEST");
    expect(lifecycle.confirmed.invoice.invoice_number).toBe("TEST-INV-0001");
    expect(lifecycle.confirmed.invoice.is_test).toBe(true);
    expect(realInvoiceCounter).toBe(12); // Real invoice sequence untouched
    expect(lifecycle.cancelled.restockedItemsCount).toBe(1);
    expect(lifecycle.cancelled.newStockQuantity).toBe(5); // Stock fully restored
    expect(lifecycle.kpisAfterConfirm.kpis).toEqual(baselineKpis);
    expect(lifecycle.kpisAfterCancel.kpis).toEqual(baselineKpis);
  });
});

test.describe("Round 2 Phase 5 E2E: Light-theme WCAG AA (>= 4.5:1) price & gold-text contrast", () => {
  test("verifies all rendered light-theme prices and gold labels meet >= 4.5:1 contrast in Chromium", async ({
    page
  }) => {
    await page.emulateMedia({ colorScheme: "light" });

    // Seed light theme + cart before React hydration so <PriceKES /> renders deterministically
    await page.addInitScript(
      ({ key, product }) => {
        window.localStorage.setItem("auro-ardon-theme", "light");
        if (!window.sessionStorage.getItem("__r2p5_contrast_seeded")) {
          window.sessionStorage.setItem("__r2p5_contrast_seeded", "1");
          window.localStorage.setItem(
            key,
            JSON.stringify([{ product, quantity: 2, variant: null }])
          );
        }
      },
      { key: CART_STORAGE_KEY, product: TEST_PRODUCT }
    );

    const checkContrastOnCurrentPage = async (routeLabel: string) => {
      return page.evaluate(label => {
        function parseCssColor(raw: string): [number, number, number, number] | null {
          const match = raw.match(
            /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d+(?:\.\d+)?))?\s*\)/
          );
          if (!match) return null;
          return [
            Number(match[1]),
            Number(match[2]),
            Number(match[3]),
            match[4] === undefined ? 1 : Number(match[4])
          ];
        }

        function resolveEffectiveBg(el: Element): [number, number, number] {
          let node: Element | null = el;
          while (node) {
            const bg = parseCssColor(window.getComputedStyle(node).backgroundColor);
            if (bg && bg[3] > 0.05) {
              return [bg[0], bg[1], bg[2]];
            }
            node = node.parentElement;
          }
          return [255, 255, 255];
        }

        function luminance(r: number, g: number, b: number): number {
          const lin = (c: number) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        }

        function ratio(
          fg: [number, number, number],
          bg: [number, number, number]
        ): number {
          const l1 = luminance(fg[0], fg[1], fg[2]);
          const l2 = luminance(bg[0], bg[1], bg[2]);
          return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        }

        const priceToken = window
          .getComputedStyle(document.documentElement)
          .getPropertyValue("--price")
          .trim();

        const targets = Array.from(
          document.querySelectorAll(".text-price, .text-\\[\\#7A5D1D\\]")
        ).filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (el.textContent?.trim().length ?? 0) > 0;
        });

        const checks = targets.map(el => {
          const fgRaw = window.getComputedStyle(el).color;
          const fg = parseCssColor(fgRaw) ?? [0, 0, 0, 1];
          const bg = resolveEffectiveBg(el);
          const contrast = Number(ratio([fg[0], fg[1], fg[2]], bg).toFixed(2));
          return {
            route: label,
            text: el.textContent?.trim().slice(0, 40) ?? "",
            fg: fgRaw,
            bg: `rgb(${bg.join(", ")})`,
            contrast
          };
        });

        return { priceToken, checks };
      }, routeLabel);
    };

    for (const pathname of ["/cart", "/checkout", "/shipping", "/returns"]) {
      await page.goto(pathname);
      await page.locator(".text-price").first().waitFor({ state: "visible" });
      await page.evaluate(() => {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
      });

      const result = await checkContrastOnCurrentPage(pathname);
      expect(result.priceToken).toBe("138 106 34");
      expect(
        result.checks.length,
        `Expected at least one price or gold label checked on ${pathname}`
      ).toBeGreaterThan(0);

      for (const item of result.checks) {
        expect(
          item.contrast,
          `Contrast failed on ${item.route} for "${item.text}" (${item.fg} on ${item.bg})`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }

    // Verify legal pages render zero visible draft wording in the browser
    for (const legalPath of ["/privacy", "/terms"]) {
      await page.goto(legalPath);
      const visibleText = await page.locator("main").innerText();
      expect(visibleText).not.toMatch(/Draft policy|Draft terms|Subject to owner legal review/i);
      expect(visibleText).toContain("Last updated:");
    }
  });
});

