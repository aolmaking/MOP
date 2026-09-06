import { BrowserDriver } from './browser-driver.mjs';

async function loginUser(driver, email, password) {
  console.log(`Logging in as ${email}...`);
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1000));
  await driver.fill('input[type="email"], input[name="email"], #email', email);
  await driver.fill('input[type="password"], input[name="password"], #password', password);
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 1500));
}

async function createItemAndReceive(driver, itemData) {
  console.log(`\n--- Processing Item: ${itemData.name} (${itemData.sku}) ---`);

  // First check if it already exists on /inventory/stock
  await driver.navigate('http://localhost:4200/inventory/stock');
  await new Promise(r => setTimeout(r, 1000));

  let itemUrl = await driver.eval(`(() => {
    const links = Array.from(document.querySelectorAll('.cell-item a'));
    const link = links.find(a => a.innerText.trim() === ${JSON.stringify(itemData.name)});
    return link ? link.href : null;
  })()`);

  if (!itemUrl) {
    console.log(`Item not found in stock table. Creating in catalog...`);
    await driver.navigate('http://localhost:4200/inventory/catalog');
    await new Promise(r => setTimeout(r, 1000));

    // Click "+ Add item"
    await driver.click('button.catalog-new, .state button.primary');
    await new Promise(r => setTimeout(r, 600));

    // Fill Name
    await driver.eval(`(() => {
      const inputs = document.querySelectorAll('.editor input');
      if (inputs[0]) {
        inputs[0].value = ${JSON.stringify(itemData.name)};
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);

    // Fill SKU
    await driver.eval(`(() => {
      const inputs = document.querySelectorAll('.editor input');
      if (inputs[1]) {
        inputs[1].value = ${JSON.stringify(itemData.sku)};
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);

    // Handle Category: check if category exists, else create it inline
    const hasCategory = await driver.eval(`(() => {
      const select = document.querySelector('.editor select');
      if (!select) return false;
      const opt = Array.from(select.options).find(o => o.text.trim() === ${JSON.stringify(itemData.category)});
      if (opt) {
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    })()`);

    if (!hasCategory) {
      console.log(`Creating category inline: ${itemData.category}`);
      await driver.eval(`(() => {
        const select = document.querySelector('.editor select');
        if (select) {
          select.value = '__new__';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await new Promise(r => setTimeout(r, 500));

      // Fill new category name
      await driver.eval(`(() => {
        const input = document.querySelector('.inline-create input');
        if (input) {
          input.value = ${JSON.stringify(itemData.category)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await new Promise(r => setTimeout(r, 300));
      await driver.eval(`(() => {
        const btn = Array.from(document.querySelectorAll('.inline-create-actions button')).find(b => b.innerText.includes('Add category'));
        if (btn) btn.click();
      })()`);
      await new Promise(r => setTimeout(r, 1200));
    }

    // Fill Selling Price
    await driver.eval(`(() => {
      const priceInput = Array.from(document.querySelectorAll('.editor input')).find(i => i.getAttribute('inputmode') === 'decimal');
      if (priceInput) {
        priceInput.value = ${JSON.stringify(itemData.price)};
        priceInput.dispatchEvent(new Event('input', { bubbles: true }));
        priceInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);

    // Fill Thresholds
    if (itemData.lowThreshold !== undefined) {
      await driver.eval(`(() => {
        const numInputs = Array.from(document.querySelectorAll('.editor input[type="number"]'));
        if (numInputs[0]) {
          numInputs[0].value = ${itemData.lowThreshold};
          numInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (numInputs[1] && ${itemData.critThreshold !== undefined}) {
          numInputs[1].value = ${itemData.critThreshold};
          numInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
    }

    // Save Item
    await driver.eval(`(() => {
      const saveBtn = Array.from(document.querySelectorAll('.editor-foot button')).find(b => b.innerText.includes('Add item') || b.innerText.includes('Save'));
      if (saveBtn) saveBtn.click();
    })()`);
    await new Promise(r => setTimeout(r, 1500));
    console.log(`Item ${itemData.sku} created.`);

    // Refresh stock page and find link
    await driver.navigate('http://localhost:4200/inventory/stock');
    await new Promise(r => setTimeout(r, 1200));
    itemUrl = await driver.eval(`(() => {
      const links = Array.from(document.querySelectorAll('.cell-item a'));
      const link = links.find(a => a.innerText.trim() === ${JSON.stringify(itemData.name)});
      return link ? link.href : null;
    })()`);
  } else {
    console.log(`Item already exists in catalog. Navigating to detail...`);
  }

  if (!itemUrl) {
    console.log(`Warning: Could not find link for ${itemData.name} on stock page`);
    return;
  }

  await driver.navigate(itemUrl);
  await new Promise(r => setTimeout(r, 1200));

  // Check current available stock and movements count
  const currentStatus = await driver.eval(`(() => {
    const availText = Array.from(document.querySelectorAll('.totals .total'))
      .find(t => t.querySelector('dt')?.innerText.includes('AVAILABLE'))
      ?.querySelector('.total-value')?.innerText.trim();
    const rows = document.querySelectorAll('.ledger tbody tr').length;
    return { available: Number(availText || '0'), movementsCount: rows };
  })()`);

  // Receive stock if initialQty > 0 and no movements recorded yet
  if (itemData.initialQty && itemData.initialQty > 0 && currentStatus.movementsCount === 0) {
    console.log(`Receiving ${itemData.initialQty} units into warehouse ${itemData.targetWhCode || 'first'}...`);
    // Click "+ Receive Stock"
    await driver.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('.item-head-actions button')).find(b => b.innerText.includes('Receive Stock'));
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 600));

    // Select warehouse if specified
    if (itemData.targetWhCode) {
      await driver.eval(`(() => {
        const select = document.querySelector('.editor select');
        if (!select) return;
        const opt = Array.from(select.options).find(o => o.text.includes(${JSON.stringify(itemData.targetWhCode)}));
        if (opt) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
    }

    // Set Quantity
    await driver.eval(`(() => {
      const input = document.querySelector('.editor input[type="number"]');
      if (input) {
        input.value = ${itemData.initialQty};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);

    // Set Notes
    await driver.eval(`(() => {
      const input = document.querySelector('.editor input[type="text"]');
      if (input) {
        input.value = ${JSON.stringify(itemData.notes || 'Initial supplier delivery shipment')};
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);

    // Submit Receipt
    await driver.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('.editor-foot button')).find(b => b.innerText.includes('Record Receipt'));
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 1500));
    console.log(`Stock receipt recorded for ${itemData.sku}`);
  }

  // Perform stock adjustment if specified and not yet adjusted
  if (itemData.adjustDelta && currentStatus.movementsCount <= 1) {
    console.log(`Adjusting count by ${itemData.adjustDelta} units...`);
    await driver.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('.item-head-actions button')).find(b => b.innerText.includes('Adjust Count'));
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 600));

    await driver.eval(`(() => {
      const input = document.querySelector('.editor input[type="number"]');
      if (input) {
        input.value = ${itemData.adjustDelta};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);

    await driver.eval(`(() => {
      const input = document.querySelector('.editor input[type="text"]');
      if (input) {
        input.value = ${JSON.stringify(itemData.adjustReason || 'Routine stock-take reconciliation')};
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);

    await driver.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('.editor-foot button')).find(b => b.innerText.includes('Save Adjustment'));
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 1500));
    console.log(`Stock adjustment recorded for ${itemData.sku}`);
  }

  // Read current totals and movements from UI
  const report = await driver.eval(`(() => {
    const totals = Array.from(document.querySelectorAll('.totals .total')).map(t => ({
      name: t.querySelector('dt')?.innerText.trim(),
      val: t.querySelector('.total-value')?.innerText.trim(),
    }));
    const movements = Array.from(document.querySelectorAll('.ledger tbody tr')).map(r => {
      const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim());
      return {
        what: cells[0],
        where: cells[1],
        before: cells[2],
        change: cells[3],
        after: cells[4],
        why: cells[5],
        when: cells[6]
      };
    });
    return { totals, movementsCount: movements.length, latestMovement: movements[0] };
  })()`);
  console.log(`Current state for ${itemData.sku}:`, report);
}

async function verifyStockFilters(driver) {
  console.log('\n=== Testing Filters & Search in Stock & Catalog ===');
  await driver.navigate('http://localhost:4200/inventory/stock');
  await new Promise(r => setTimeout(r, 1000));

  // Search
  await driver.fill('input[type="search"]', 'Oil');
  await new Promise(r => setTimeout(r, 600));
  const searchCount = await driver.eval(`document.querySelectorAll('tbody tr').length`);
  console.log(`Search for "Oil" returned: ${searchCount} rows`);

  // Clear search
  await driver.fill('input[type="search"]', '');
  await new Promise(r => setTimeout(r, 600));
  const totalCount = await driver.eval(`document.querySelectorAll('tbody tr').length`);
  console.log(`Cleared search, returned: ${totalCount} rows`);

  // Check catalog page
  await driver.navigate('http://localhost:4200/inventory/catalog');
  await new Promise(r => setTimeout(r, 1000));
  const catItems = await driver.eval(`document.querySelectorAll('tbody tr').length`);
  console.log(`Catalog page rows count: ${catItems}`);
}

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  // ==========================================
  // WORKSHOP A: Precision Motors Service Center
  // ==========================================
  console.log('\n==================================================');
  console.log('POPULATING INVENTORY FOR WORKSHOP A (Precision Motors)');
  console.log('==================================================');
  await loginUser(driver, 'inventory@precision-motors.local', 'ChangeMe-Staff-123');

  const itemsA = [
    {
      name: 'Synthetic Motor Oil 5W-30 (1L)',
      sku: 'PMC-OIL-5W30',
      category: 'Fluids & Lubricants',
      price: '18.50',
      lowThreshold: 20,
      critThreshold: 5,
      targetWhCode: 'PMC-FLD',
      initialQty: 100,
      adjustDelta: -5,
      adjustReason: 'Workshop dispensing evaporation and line test',
      notes: 'Shell Helix Ultra 5W-30 delivery PO-4401',
    },
    {
      name: 'DOT 4 High Performance Brake Fluid (500ml)',
      sku: 'PMC-FLD-DOT4',
      category: 'Fluids & Lubricants',
      price: '12.00',
      lowThreshold: 15,
      critThreshold: 3,
      targetWhCode: 'PMC-FLD',
      initialQty: 40,
      notes: 'Castrol React Performance DOT 4 PO-4402',
    },
    {
      name: 'Premium Ceramic Front Brake Pads',
      sku: 'PMC-BRK-PAD01',
      category: 'Brake Components',
      price: '85.00',
      lowThreshold: 8,
      critThreshold: 2,
      targetWhCode: 'PMC-CEN',
      initialQty: 25,
      notes: 'Brembo Ceramic Front Pad Set PO-4403',
    },
    {
      name: 'Vented Front Brake Disc Rotor (320mm)',
      sku: 'PMC-BRK-ROT01',
      category: 'Brake Components',
      price: '145.00',
      lowThreshold: 6,
      critThreshold: 2,
      targetWhCode: 'PMC-CEN',
      initialQty: 4, // Low stock scenario!
      notes: 'Zimmermann Coat Z Rotors PO-4404',
    },
    {
      name: 'OEM Engine Oil Filter Element',
      sku: 'PMC-FLT-OIL01',
      category: 'Filters',
      price: '14.00',
      lowThreshold: 15,
      critThreshold: 5,
      targetWhCode: 'PMC-FST',
      initialQty: 60,
      notes: 'Mann-Filter HU 711/51 z PO-4405',
    },
    {
      name: 'High Efficiency Cabin Air Filter',
      sku: 'PMC-FLT-CAB01',
      category: 'Filters',
      price: '28.00',
      lowThreshold: 10,
      critThreshold: 3,
      targetWhCode: 'PMC-FST',
      initialQty: 20,
      notes: 'Mann-Filter CUK 2939 Activated Charcoal PO-4406',
    },
    {
      name: 'Iridium Spark Plug (Set of 4)',
      sku: 'PMC-ELC-SPK01',
      category: 'Electrical Parts',
      price: '64.00',
      lowThreshold: 8,
      critThreshold: 2,
      targetWhCode: 'PMC-CEN',
      initialQty: 16,
      notes: 'NGK Laser Iridium ILZKR7B-11 PO-4407',
    },
    {
      name: '12V AGM Starter Battery 70Ah',
      sku: 'PMC-ELC-BAT01',
      category: 'Electrical Parts',
      price: '210.00',
      lowThreshold: 5,
      critThreshold: 1,
      targetWhCode: 'PMC-CEN',
      initialQty: 3, // Low stock scenario!
      notes: 'Varta Silver Dynamic AGM PO-4408',
    },
    {
      name: 'High Pressure Fuel Pump',
      sku: 'PMC-ENG-HPFP1',
      category: 'Engine Components',
      price: '680.00',
      lowThreshold: 2,
      critThreshold: 1,
      initialQty: 0, // Zero stock scenario!
      notes: 'Bosch Genuine HPFP (Special order item)',
    },
  ];

  for (const item of itemsA) {
    await createItemAndReceive(driver, item);
  }
  await verifyStockFilters(driver);

  // ==========================================
  // WORKSHOP B: Heritage Auto Restoration
  // ==========================================
  console.log('\n==================================================');
  console.log('POPULATING INVENTORY FOR WORKSHOP B (Heritage Restoration)');
  console.log('==================================================');
  await loginUser(driver, 'parts@heritage-restoration.local', 'ChangeMe-Staff-123');

  const itemsB = [
    {
      name: 'Single-Stage Classic Paint - British Racing Green (1 Gallon)',
      sku: 'HAR-PNT-BRG01',
      category: 'Paint & Finishing',
      price: '240.00',
      lowThreshold: 3,
      critThreshold: 1,
      targetWhCode: 'HAR-WH-MAT',
      initialQty: 8,
      notes: 'PPG Deltron Classic Formulation PO-5501',
    },
    {
      name: 'Auto Body Rust Converter & Metal Primer (1L)',
      sku: 'HAR-MAT-RST01',
      category: 'Restoration Materials',
      price: '35.00',
      lowThreshold: 10,
      critThreshold: 2,
      targetWhCode: 'HAR-WH-MAT',
      initialQty: 30,
      notes: 'Bilt-Hamber Deox Gel PO-5502',
    },
    {
      name: 'Vintage Carburetor Rebuild Kit (Weber DCOE 40)',
      sku: 'HAR-MEC-CRB01',
      category: 'Classic Mechanical',
      price: '175.00',
      lowThreshold: 4,
      critThreshold: 1,
      targetWhCode: 'HAR-WH-MEC',
      initialQty: 3, // Low stock!
      notes: 'Weber Genuine Gaskets & Jets Kit PO-5503',
    },
    {
      name: 'Classic Points & Condenser Ignition Set',
      sku: 'HAR-MEC-IGN01',
      category: 'Classic Mechanical',
      price: '42.00',
      lowThreshold: 5,
      critThreshold: 2,
      targetWhCode: 'HAR-WH-MEC',
      initialQty: 12,
      notes: 'Lucas Vintage Ignition Contact Set PO-5504',
    },
    {
      name: 'Salvaged 1968 Chrome Side Mirror Assembly (Original)',
      sku: 'HAR-SLV-MIR01',
      category: 'Salvaged Components',
      price: '310.00',
      lowThreshold: 2,
      critThreshold: 1,
      targetWhCode: 'HAR-WH-SLV',
      initialQty: 2, // Rare salvaged item!
      notes: 'Acquired from 1968 E-Type Donor Car',
    },
    {
      name: 'Custom Aluminum Sheet Metal 16-Gauge (4x8ft)',
      sku: 'HAR-FAB-ALM01',
      category: 'Custom Fabrication',
      price: '120.00',
      lowThreshold: 5,
      critThreshold: 1,
      targetWhCode: 'HAR-WH-MAT',
      initialQty: 10,
      notes: '5052-H32 Aluminum Fabrication Stock PO-5505',
    },
    {
      name: 'Rare Vintage Mechanical Fuel Pump (Original BCD 1972)',
      sku: 'HAR-MEC-PMP99',
      category: 'Classic Mechanical',
      price: '520.00',
      lowThreshold: 1,
      critThreshold: 1,
      initialQty: 0, // Zero stock / obsolete item!
      notes: 'Obsolete part - waiting on specialty vintage fabricator',
    },
  ];

  for (const item of itemsB) {
    await createItemAndReceive(driver, item);
  }
  await verifyStockFilters(driver);

  // ==========================================
  // WORKSHOP C: Rapid Fleet & Commercial Garage
  // ==========================================
  console.log('\n==================================================');
  console.log('POPULATING INVENTORY FOR WORKSHOP C (Rapid Fleet)');
  console.log('==================================================');
  await loginUser(driver, 'warehouse@rapid-fleet.local', 'ChangeMe-Staff-123');

  const itemsC = [
    {
      name: 'Heavy Duty Diesel Engine Oil 15W-40 (20L Drum)',
      sku: 'RFC-LUB-15W40',
      category: 'Heavy Lubricants',
      price: '110.00',
      lowThreshold: 10,
      critThreshold: 3,
      targetWhCode: 'RFC-WH-CEN',
      initialQty: 50,
      adjustDelta: -2,
      adjustReason: 'Fleet dispensing pump calibration loss',
      notes: 'Mobil Delvac Modern 15W-40 Super PO-6601',
    },
    {
      name: 'Commercial Truck Fleet Air Filter Element',
      sku: 'RFC-FLT-AIR01',
      category: 'Commercial Filters',
      price: '48.00',
      lowThreshold: 15,
      critThreshold: 5,
      targetWhCode: 'RFC-WH-CEN',
      initialQty: 45,
      notes: 'Donaldson Heavy Duty Air Cleaner PO-6602',
    },
    {
      name: 'Heavy Duty Spin-On Fuel Water Separator',
      sku: 'RFC-FLT-SEP01',
      category: 'Commercial Filters',
      price: '38.00',
      lowThreshold: 20,
      critThreshold: 6,
      targetWhCode: 'RFC-WH-CEN',
      initialQty: 60,
      notes: 'Fleetguard FS19732 Fuel Water Separator PO-6603',
    },
    {
      name: 'Heavy Duty Commercial Front Brake Pads (Transit / Van)',
      sku: 'RFC-BRK-PAD99',
      category: 'Heavy Duty Brakes',
      price: '95.00',
      lowThreshold: 12,
      critThreshold: 4,
      targetWhCode: 'RFC-WH-HVY',
      initialQty: 30,
      notes: 'Ferodo Premier Commercial Pad Set PO-6604',
    },
    {
      name: 'Commercial Truck Brake Drum Assembly',
      sku: 'RFC-BRK-DRM01',
      category: 'Heavy Duty Brakes',
      price: '260.00',
      lowThreshold: 4,
      critThreshold: 1,
      targetWhCode: 'RFC-WH-HVY',
      initialQty: 4, // Low stock!
      notes: 'Meritor Genuine 16.5x7 Brake Drum PO-6605',
    },
    {
      name: 'Heavy Duty 24V Commercial Fleet Battery 180Ah',
      sku: 'RFC-BAT-24V18',
      category: 'Commercial Batteries',
      price: '380.00',
      lowThreshold: 6,
      critThreshold: 2,
      targetWhCode: 'RFC-WH-HVY',
      initialQty: 5, // Low stock!
      notes: 'Exide Promax Heavy 24V Battery PO-6606',
    },
    {
      name: 'Emergency DOT Approved Fleet Wiper Blades (Pair)',
      sku: 'RFC-EMG-WPR01',
      category: 'Emergency Consumables',
      price: '24.00',
      lowThreshold: 15,
      critThreshold: 5,
      targetWhCode: 'RFC-WH-EMG',
      initialQty: 40,
      notes: 'Bosch Aerotwin Commercial 26/24 PO-6607',
    },
    {
      name: 'Commercial Alternator 24V 150A Heavy Duty',
      sku: 'RFC-FLT-ALT01',
      category: 'Fleet Maintenance',
      price: '750.00',
      lowThreshold: 2,
      critThreshold: 1,
      initialQty: 0, // Zero stock scenario!
      notes: 'Prestolite Leece-Neville 24V Alternator (Emergency backorder)',
    },
  ];

  for (const item of itemsC) {
    await createItemAndReceive(driver, item);
  }
  await verifyStockFilters(driver);

  console.log('\n==================================================');
  console.log('INVENTORY STRESS TEST COMPLETED SUCCESSFULLY FOR ALL 3 WORKSHOPS!');
  console.log('==================================================');
  driver.close();
}

main().catch(console.error);
