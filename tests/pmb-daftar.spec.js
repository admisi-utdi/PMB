const { test, expect } = require('@playwright/test');

// Helper function for common setup tasks (interception, logging, going to home and step 0)
async function setupCommon(page) {
  test.setTimeout(60000);
  const mockData = require('./mock-all-data.json');

  await page.addInitScript((data) => {
    window.localStorage.setItem('pmb:data:all:v1', JSON.stringify({ value: data, savedAt: Date.now() }));
  }, mockData);

  // Monitor browser console logs and page errors
  page.on('console', msg => console.log(`🖥️ BROWSER LOG: [${msg.type()}] ${msg.text()}`));
  page.on('pageerror', exception => {
    console.log(`❌ BROWSER ERROR: ${exception.message}`);
  });

  // Monitor and log any alerts/dialogs
  page.on('dialog', async dialog => {
    console.log(`💬 DIALOG POPPED UP: [${dialog.type()}] "${dialog.message()}"`);
    await dialog.dismiss();
  });

  // 1. Set up network interception for OTP and config loading
  await page.route('**/macros/s/**/exec*', async (route) => {
    const request = route.request();
    const url = request.url();

    // Intercept config load to avoid Google Apps Script CORS/Throttling issues
    if (request.method() === 'GET' && url.includes('action=all')) {
      console.log('🔄 Intercepted GET request: action=all. Returning local mock configuration data...');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockData),
      });
      return;
    }

    if (request.method() === 'POST') {
      const postData = request.postData();
      if (postData && postData.includes('kirim_otp_wa')) {
        console.log('🔄 Intercepted request: kirim_otp_wa. Mocking response to bypass WA OTP...');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, skipped: true }),
        });
        return;
      }
      if (postData && postData.includes('verif_otp')) {
        console.log('🔄 Intercepted request: verif_otp. Mocking response...');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ valid: true }),
        });
        return;
      }
      if (postData && postData.includes('daftar')) {
        console.log('🔄 Intercepted request: daftar. Mocking registration response...');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, no_daftar: `TEST-${Date.now()}` }),
        });
        return;
      }
    }
    // Let any other request pass through to the real server
    await route.continue();
  });

  // 2. Go to the local site
  await page.goto('/');

  // 3. Wait for the loading screen to disappear
  console.log('⏳ Waiting for loading screen to disappear...');
  const loadingScreen = page.locator('#pmb-loading');
  await expect(loadingScreen).toBeHidden({ timeout: 15000 });
  await page.waitForTimeout(1000); // Wait for transitions to finish

  console.log('👉 Step 0: Gelombang');
  // Click "Lanjut: Pilih Skema →"
  const nextBtn0 = page.locator('#nextBtn0');
  await expect(nextBtn0).toBeVisible();
  await nextBtn0.click();
}

// Helper function to fill form and submit registration (Step 5)
async function fillFormAndSubmit(page, prefix) {
  console.log('👉 Step 5: Isi Data Diri');
  
  // Generate a unique identifier for testing to easily locate in the Sheets
  const uniqueId = Date.now().toString().slice(-4);
  const testName = `Bot Playwright ${prefix}-${uniqueId}`;

  // Fill basic personal info
  await page.fill('#fNama', testName);
  await page.fill('#fNik', `123456789012${uniqueId}`);
  await page.fill('#fTtl', 'Yogyakarta');
  await page.fill('#fTgl', '2005-05-15');
  await page.selectOption('#fJk', 'Laki-laki');
  await page.selectOption('#fAgama', 'Islam');
  await page.fill('#fEmail', `playwright.test.${prefix.toLowerCase()}.${uniqueId}@example.com`);
  await page.fill('#fWa', '628111111111'); // Dummy number

  // Trigger WA Verification (Will be intercepted and mock-verified)
  console.log('🚀 Triggering WA Verification...');
  const btnOtpWa = page.locator('#btnOtpWa');
  await btnOtpWa.click();
  
  // Wait until status shows "Terverifikasi"
  await expect(btnOtpWa).toHaveText('Terverifikasi ✅');
  console.log('✅ WA Verification successfully bypassed!');

  // Fill address details
  await page.fill('#fAlamat', `Jl. Automasi Playwright ${prefix} No. 99`);
  await page.fill('#fRt', '005');
  await page.fill('#fRw', '006');
  await page.fill('#fDesa', 'Kelurahan Test');
  await page.fill('#fKecamatan', 'Kecamatan Test');

  // Select Province (Select the first non-empty option)
  console.log('Selecting Province...');
  const provSelect = page.locator('#fProvinsi');
  await provSelect.selectOption({ index: 1 });

  // Wait for City dropdown to load options, then select the first valid option
  console.log('Selecting City...');
  const kotaSelect = page.locator('#fKota');
  await page.waitForFunction(() => {
    const select = document.getElementById('fKota');
    return select && select.options.length > 1;
  });
  await kotaSelect.selectOption({ index: 1 });

  // Fill School Details
  await page.fill('#fNisn', `005123${uniqueId}`);
  
  // Click "Input Manual" button for School
  const manualSchoolBtn = page.getByRole('button', { name: /Input Manual/i });
  await manualSchoolBtn.click();

  await page.fill('#fNpsn', '20101234');
  await page.fill('#fNamaSekolah', 'SMA Negeri Playwright');
  
  // Wait for Major dropdown to load options, then select the first valid option
  const majorSelect = page.locator('#fJurusanSekolah');
  await page.waitForFunction(() => {
    const select = document.getElementById('fJurusanSekolah');
    return select && select.options.length > 1;
  });
  await majorSelect.selectOption({ index: 1 });

  await page.fill('#fReferral', 'Playwright Automated Bot');

  // Submit Registration (This request will go directly to Google Sheets API!)
  console.log('📤 Submitting final registration payload...');
  const submitBtn = page.locator('#btnSubmitFinal');
  await expect(submitBtn).toBeEnabled();
  
  // Wait for network response for the submit request (so we can observe failures)
  const submitPromise = page.waitForResponse(response => 
    response.url().includes('/macros/s/') && response.request().method() === 'POST'
  );

  await submitBtn.click();

  // Wait for the Google Apps Script post response to verify submission worked
  console.log('⏳ Waiting for Google Apps Script server response...');
  try {
    const response = await submitPromise;
    console.log(`📥 Apps Script response received. Status: ${response.status()}`);
    const responseBody = await response.text();
    console.log(`📥 Apps Script response body: ${responseBody}`);
  } catch (err) {
    console.log(`⚠️ Error waiting for Apps Script response: ${err.message}`);
  }

  // Wait for Success Modal to appear
  console.log('⏳ Waiting for success modal...');
  const successModal = page.locator('#modalSuccess');
  await expect(successModal).toHaveClass(/show/, { timeout: 30000 });

  const modalBodyText = await page.locator('#modalBody').innerText();
  console.log('\n======================================================');
  console.log(`🎉 REGISTRATION SUCCESSFUL FOR PREFIX [${prefix}]!`);
  console.log('Detail Modal:');
  console.log(modalBodyText);
  console.log('======================================================\n');

  // Wait 3 seconds for visual verification before ending
  await page.waitForTimeout(3000);
}

// -------------------------------------------------------------
// OMT OPTIMIZED TEST SUITE (Covers all 3 Skemas, 7 Jalurs, 6 Prodis)
// -------------------------------------------------------------

// Test 1: Smart Learning + Raport + Informatika (IF)
test('Test Case 1: Smart Learning + Raport + Informatika (IF)', async ({ page }) => {
  await setupCommon(page);

  console.log('👉 Step 1: Skema (Smart Learning)');
  const skemaCard = page.locator('.skema-card[data-id="smart_learning"]');
  await expect(skemaCard).toBeVisible();
  await skemaCard.click();
  await page.locator('#nextBtn1').click();

  console.log('👉 Step 2: Jalur (Raport)');
  const jalurCard = page.locator('.jalur-card#jalurCard-raport');
  await expect(jalurCard).toBeVisible();
  await jalurCard.click();
  await page.locator('#nextBtn2').click();

  console.log('👉 Step 3: Prodi (Informatika)');
  const prodiCard = page.locator('.prodi-card', { hasText: 'Informatika' }).first();
  await expect(prodiCard).toBeVisible();
  await prodiCard.click();
  await page.locator('#nextBtn3').click();

  console.log('👉 Step 4: Estimasi');
  await page.getByRole('button', { name: /Lanjut: Isi Data Diri/i }).click();

  await fillFormAndSubmit(page, 'SL-RAPORT-IF');
});

// Test 2: Reguler / Offline + UTBK + Sistem Informasi (SI)
test('Test Case 2: Reguler / Offline + UTBK + Sistem Informasi (SI)', async ({ page }) => {
  await setupCommon(page);

  console.log('👉 Step 1: Skema (Reguler / Offline)');
  const skemaCard = page.locator('.skema-card[data-id="reguler"]');
  await expect(skemaCard).toBeVisible();
  await skemaCard.click();
  await page.locator('#nextBtn1').click();

  console.log('👉 Step 2: Jalur (UTBK)');
  const jalurCard = page.locator('.jalur-card#jalurCard-utbk');
  await expect(jalurCard).toBeVisible();
  await jalurCard.click();
  await page.locator('#nextBtn2').click();

  console.log('👉 Step 3: Prodi (Sistem Informasi)');
  const prodiCard = page.locator('.prodi-card', { hasText: 'Sistem Informasi' }).first();
  await expect(prodiCard).toBeVisible();
  await prodiCard.click();
  await page.locator('#nextBtn3').click();

  console.log('👉 Step 4: Estimasi');
  await page.getByRole('button', { name: /Lanjut: Isi Data Diri/i }).click();

  await fillFormAndSubmit(page, 'REG-UTBK-SI');
});

// Test 3: Reguler / Offline + KIPK + Teknik Komputer (TK)
test('Test Case 3: Reguler / Offline + KIPK + Teknik Komputer (TK)', async ({ page }) => {
  await setupCommon(page);

  console.log('👉 Step 1: Skema (Reguler / Offline)');
  const skemaCard = page.locator('.skema-card[data-id="reguler"]');
  await expect(skemaCard).toBeVisible();
  await skemaCard.click();
  await page.locator('#nextBtn1').click();

  console.log('👉 Step 2: Jalur (KIPK)');
  const jalurCard = page.locator('.jalur-card#jalurCard-kipk');
  await expect(jalurCard).toBeVisible();
  await jalurCard.click();
  await page.locator('#nextBtn2').click();

  console.log('👉 Step 3: Prodi (Teknik Komputer)');
  const prodiCard = page.locator('.prodi-card', { hasText: 'Teknik Komputer' }).first();
  await expect(prodiCard).toBeVisible();
  await prodiCard.click();
  await page.locator('#nextBtn3').click();

  console.log('👉 Step 4: Estimasi');
  await page.getByRole('button', { name: /Lanjut: Isi Data Diri/i }).click();

  await fillFormAndSubmit(page, 'REG-KIPK-TK');
});

// Test 4: Smart Learning + RPL + Bisnis Digital (BD)
test('Test Case 4: Smart Learning + RPL + Bisnis Digital (BD)', async ({ page }) => {
  await setupCommon(page);

  console.log('👉 Step 1: Skema (Smart Learning)');
  const skemaCard = page.locator('.skema-card[data-id="smart_learning"]');
  await expect(skemaCard).toBeVisible();
  await skemaCard.click();
  await page.locator('#nextBtn1').click();

  console.log('👉 Step 2: Jalur (RPL)');
  const jalurCard = page.locator('.jalur-card#jalurCard-rpl');
  await expect(jalurCard).toBeVisible();
  await jalurCard.click();

  // Wait for RPL sub-card to appear and click the first one (RPL Eksternal)
  const rplSubCard = page.locator('.rpl-sub-card').first();
  await expect(rplSubCard).toBeVisible();
  await rplSubCard.click();
  await page.locator('#nextBtn2').click();

  console.log('👉 Step 3: Prodi (Bisnis Digital)');
  const prodiCard = page.locator('.prodi-card', { hasText: 'Bisnis Digital' }).first();
  await expect(prodiCard).toBeVisible();
  await prodiCard.click();
  await page.locator('#nextBtn3').click();

  console.log('👉 Step 4: Estimasi');
  await page.getByRole('button', { name: /Lanjut: Isi Data Diri/i }).click();

  await fillFormAndSubmit(page, 'SL-RPL-BD');
});

// Test 5: Smart Learning + Kelas Karyawan + Informatika (IF)
test('Test Case 5: Smart Learning + Kelas Karyawan + Informatika (IF)', async ({ page }) => {
  await setupCommon(page);

  console.log('👉 Step 1: Skema (Smart Learning)');
  const skemaCard = page.locator('.skema-card[data-id="smart_learning"]');
  await expect(skemaCard).toBeVisible();
  await skemaCard.click();
  await page.locator('#nextBtn1').click();

  console.log('👉 Step 2: Jalur (Kelas Karyawan)');
  const jalurCard = page.locator('.jalur-card#jalurCard-karyawan');
  await expect(jalurCard).toBeVisible();
  await jalurCard.click();
  await page.locator('#nextBtn2').click();

  console.log('👉 Step 3: Prodi (Informatika)');
  const prodiCard = page.locator('.prodi-card', { hasText: 'Informatika' }).first();
  await expect(prodiCard).toBeVisible();
  await prodiCard.click();
  await page.locator('#nextBtn3').click();

  console.log('👉 Step 4: Estimasi');
  await page.getByRole('button', { name: /Lanjut: Isi Data Diri/i }).click();

  await fillFormAndSubmit(page, 'SL-KARYAWAN-IF');
});

// Test 6: Jalur Kerjasama + Kemitraan + Mitra: Kerjasama Kota Palu (S1) + Prodi: Manajemen Ritel (MR)
test('Test Case 6: Jalur Kerjasama + Kemitraan + Kota Palu (S1) + Manajemen Ritel (MR)', async ({ page }) => {
  await setupCommon(page);

  console.log('👉 Step 1: Skema (Jalur Kerjasama)');
  const skemaCard = page.locator('.skema-card[data-id="kerjasama"]');
  await expect(skemaCard).toBeVisible();
  await skemaCard.click();

  console.log('👉 Pilih Instansi Mitra (Kota Palu S1)');
  const mitraCard = page.locator('.mitra-card', { hasText: 'Kerjasama Kota Palu (S1)' }).first();
  await expect(mitraCard).toBeVisible();
  await mitraCard.click();
  await page.locator('#nextBtn1').click();

  console.log('👉 Step 2: Jalur (Kemitraan)');
  const jalurCard = page.locator('.jalur-card#jalurCard-kemitraan');
  await expect(jalurCard).toBeVisible();
  await jalurCard.click();
  await page.locator('#nextBtn2').click();

  console.log('👉 Step 3: Prodi (Manajemen Ritel)');
  const prodiCard = page.locator('.prodi-card', { hasText: 'Manajemen Ritel' }).first();
  await expect(prodiCard).toBeVisible();
  await prodiCard.click();
  await page.locator('#nextBtn3').click();

  console.log('👉 Step 4: Estimasi');
  await page.getByRole('button', { name: /Lanjut: Isi Data Diri/i }).click();

  await fillFormAndSubmit(page, 'KERJASAMA-MITRA-MR');
});

// Test 7: Jalur Kerjasama + Alumni + Mitra: Kerjasama Kota Palu (S2) + Prodi: Teknologi Informasi (MTI)
test('Test Case 7: Jalur Kerjasama + Alumni + Kota Palu (S2) + Teknologi Informasi (MTI)', async ({ page }) => {
  await setupCommon(page);

  console.log('👉 Step 1: Skema (Jalur Kerjasama)');
  const skemaCard = page.locator('.skema-card[data-id="kerjasama"]');
  await expect(skemaCard).toBeVisible();
  await skemaCard.click();

  console.log('👉 Pilih Instansi Mitra (Kota Palu S2)');
  const mitraCard = page.locator('.mitra-card', { hasText: 'Kerjasama Kota Palu (S2)' }).first();
  await expect(mitraCard).toBeVisible();
  await mitraCard.click();
  await page.locator('#nextBtn1').click();

  console.log('👉 Step 2: Jalur (Alumni)');
  const jalurCard = page.locator('.jalur-card#jalurCard-alumni');
  await expect(jalurCard).toBeVisible();
  await jalurCard.click();
  await page.locator('#nextBtn2').click();

  console.log('👉 Step 3: Prodi (Teknologi Informasi)');
  const prodiCard = page.locator('.prodi-card', { hasText: 'Teknologi Informasi' }).first();
  await expect(prodiCard).toBeVisible();
  await prodiCard.click();
  await page.locator('#nextBtn3').click();

  console.log('👉 Step 4: Estimasi');
  await page.getByRole('button', { name: /Lanjut: Isi Data Diri/i }).click();

  await fillFormAndSubmit(page, 'KERJASAMA-ALUMNI-MTI');
});
