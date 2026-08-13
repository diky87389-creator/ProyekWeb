// === Manajemen Hutang (Kasbon) Pelanggan ===
// Warung Sayur Diky - Vanilla JS + localStorage

(function () {
  "use strict";

  var STORAGE_KEY = "wsd_hutang_data";
  var debts = loadData();

  // --- Data layer ---
  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(debts));
  }

  // --- Helpers ---
  function formatCurrency(n) {
    return "Rp" + (n || 0).toLocaleString("id-ID");
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formatDate(d) {
    if (!d) return "-";
    var date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  }

  function calcTotal(debt) {
    return (debt.items || []).reduce(function (sum, item) {
      return sum + (Number(item.qty) || 0) * (Number(item.price) || 0);
    }, 0);
  }

  function getInitials(name) {
    return (name || "?").trim().split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  function showToast(msg) {
    var toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("toast-show");
    setTimeout(function () { toast.classList.remove("toast-show"); }, 2200);
  }

  // --- DOM refs ---
  var debtList = document.getElementById("debt-list");
  var searchInput = document.getElementById("search-input");
  var filterStatus = document.getElementById("filter-status");
  var filterMonth = document.getElementById("filter-month");
  var addButton = document.getElementById("add-button");
  var exportButton = document.getElementById("export-button");
  var importButton = document.getElementById("import-button");
  var importFile = document.getElementById("import-file");

  // --- Render summary ---
  function renderSummary() {
    var outstanding = debts.filter(function (d) { return d.status === "belum"; }).reduce(function (s, d) { return s + calcTotal(d); }, 0);
    var unpaidCount = debts.filter(function (d) { return d.status === "belum"; }).length;
    var income = debts.filter(function (d) { return d.status === "lunas"; }).reduce(function (s, d) { return s + calcTotal(d); }, 0);
    var totalAll = debts.reduce(function (s, d) { return s + calcTotal(d); }, 0);

    document.getElementById("summary-outstanding").textContent = formatCurrency(outstanding);
    document.getElementById("summary-outstanding-hint").textContent = outstanding > 0 ? unpaidCount + " pelanggan" : "Belum ada tagihan";
    document.getElementById("summary-customers").textContent = unpaidCount;
    document.getElementById("summary-income").textContent = formatCurrency(income);
    document.getElementById("summary-total").textContent = formatCurrency(totalAll);
    document.getElementById("summary-total-hint").textContent = debts.length + " transaksi";
  }

  // --- Filter & render list ---
  function getFilteredDebts() {
    var q = (searchInput.value || "").toLowerCase().trim();
    var status = filterStatus.value;
    var month = filterMonth.value;

    return debts.filter(function (d) {
      if (q && (d.customerName || "").toLowerCase().indexOf(q) === -1) return false;
      if (status !== "all" && d.status !== status) return false;
      if (month !== "all") {
        var d2 = new Date(d.date);
        if (isNaN(d2.getTime()) || String(d2.getMonth() + 1) !== month) return false;
      }
      return true;
    });
  }

  function renderList() {
    renderSummary();
    var filtered = getFilteredDebts();

    if (filtered.length === 0) {
      debtList.innerHTML =
        '<div class="empty-state">' +
        "<h3>Belum ada data hutang</h3>" +
        "<p>" + (debts.length === 0 ? 'Klik "Tambah Hutang" untuk mencatat kasbon pelanggan.' : "Tidak ada hasil untuk filter ini.") + "</p>" +
        "</div>";
      return;
    }

    debtList.innerHTML = filtered.map(function (d) {
      var total = calcTotal(d);
      var itemsText = (d.items || []).map(function (i) { return i.name + " ×" + i.qty; }).join(", ");
      var payBtn = d.status === "belum"
        ? '<button class="action-btn action-pay" data-action="pay" data-id="' + d.id + '">💳 Bayar</button>'
        : '<button class="action-btn" data-action="receipt" data-id="' + d.id + '">🧾 Lihat Struk</button>';
      var waBtn = d.phone
        ? '<button class="action-btn action-wa" data-action="wa" data-id="' + d.id + '">💬 WhatsApp</button>'
        : "";

      return (
        '<article class="debt-card ' + (d.status === "lunas" ? "is-paid" : "") + '" data-id="' + d.id + '">' +
        '<div class="debt-top">' +
        '<div class="debt-customer">' +
        '<div class="debt-avatar">' + getInitials(d.customerName) + "</div>" +
        "<div>" +
        '<p class="debt-name">' + escapeHtml(d.customerName) + "</p>" +
        '<p class="debt-sub">' + formatDate(d.date) + (d.dueDate ? " • Jatuh tempo " + formatDate(d.dueDate) : "") + "</p>" +
        '<p class="debt-sub">' + escapeHtml(itemsText || "-") + "</p>" +
        "</div>" +
        "</div>" +
        '<div class="debt-amount">' +
        "<strong>" + formatCurrency(total) + "</strong>" +
        '<span class="status-badge status-' + d.status + '">' + (d.status === "lunas" ? "Lunas" : "Belum Lunas") + "</span>" +
        "</div>" +
        "</div>" +
        '<div class="debt-actions">' +
        payBtn +
        '<button class="action-btn" data-action="detail" data-id="' + d.id + '">📋 Histori</button>' +
        waBtn +
        '<button class="action-btn" data-action="edit" data-id="' + d.id + '">✏️ Edit</button>' +
        '<button class="action-btn action-danger" data-action="delete" data-id="' + d.id + '">🗑️ Hapus</button>' +
        "</div>" +
        "</article>"
      );
    }).join("");
  }

  // --- Debt list click handler ---
  debtList.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    var action = btn.getAttribute("data-action");
    var debt = debts.find(function (d) { return d.id === id; });
    if (!debt) return;

    if (action === "pay") openPayModal(debt);
    else if (action === "receipt") openReceiptModal(debt);
    else if (action === "detail") openDetailModal(debt);
    else if (action === "wa") sendWhatsApp(debt);
    else if (action === "edit") openFormModal(debt);
    else if (action === "delete") deleteDebt(debt);
  });

  // --- Form modal (add/edit) ---
  var formModal = document.getElementById("form-modal");
  var debtForm = document.getElementById("debt-form");
  var itemsContainer = document.getElementById("items-container");
  var addItemBtn = document.getElementById("add-item-btn");
  var formTitle = document.getElementById("form-title");

  function openFormModal(debt) {
    formTitle.textContent = debt ? "Edit Hutang" : "Tambah Hutang";
    document.getElementById("debt-id").value = debt ? debt.id : "";
    document.getElementById("customer-name").value = debt ? debt.customerName : "";
    document.getElementById("customer-phone").value = debt ? (debt.phone || "") : "";
    document.getElementById("debt-date").value = debt ? debt.date : new Date().toISOString().slice(0, 10);
    document.getElementById("due-date").value = debt ? (debt.dueDate || "") : "";
    document.getElementById("debt-note").value = debt ? (debt.note || "") : "";
    itemsContainer.innerHTML = "";
    if (debt && debt.items && debt.items.length) {
      debt.items.forEach(function (item) { addItemRow(item); });
    } else {
      addItemRow();
    }
    formModal.hidden = false;
  }

  function addItemRow(item) {
    var row = document.createElement("div");
    row.className = "item-row-input";
    row.innerHTML =
      '<input type="text" class="item-name" placeholder="Nama item" value="' + (item && item.name ? escapeHtml(item.name) : "") + '" />' +
      '<input type="number" class="item-qty" placeholder="Qty" min="1" value="' + (item ? item.qty : "1") + '" />' +
      '<input type="number" class="item-price" placeholder="Harga" min="0" value="' + (item ? item.price : "") + '" />' +
      '<button type="button" class="remove-item">✕</button>';
    itemsContainer.appendChild(row);
  }

  addItemBtn.addEventListener("click", function () { addItemRow(); });

  itemsContainer.addEventListener("click", function (e) {
    if (e.target.classList.contains("remove-item")) {
      e.target.closest(".item-row-input").remove();
    }
  });

  debtForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = document.getElementById("debt-id").value;
    var items = [];
    itemsContainer.querySelectorAll(".item-row-input").forEach(function (row) {
      var name = row.querySelector(".item-name").value.trim();
      var qty = Number(row.querySelector(".item-qty").value) || 0;
      var price = Number(row.querySelector(".item-price").value) || 0;
      if (name) items.push({ name: name, qty: qty, price: price });
    });

    if (items.length === 0) {
      showToast("Tambahkan minimal 1 item");
      return;
    }

    var data = {
      id: id || uid(),
      customerName: document.getElementById("customer-name").value.trim(),
      phone: document.getElementById("customer-phone").value.trim(),
      date: document.getElementById("debt-date").value,
      dueDate: document.getElementById("due-date").value,
      items: items,
      note: document.getElementById("debt-note").value.trim(),
      status: "belum",
      createdDate: new Date().toISOString()
    };

    if (id) {
      var idx = debts.findIndex(function (d) { return d.id === id; });
      if (idx > -1) {
        data.status = debts[idx].status;
        data.paymentMethod = debts[idx].paymentMethod;
        data.paymentDate = debts[idx].paymentDate;
        data.createdDate = debts[idx].createdDate;
        debts[idx] = data;
      }
    } else {
      debts.unshift(data);
    }

    saveData();
    renderList();
    formModal.hidden = true;
    showToast(id ? "Hutang diperbarui" : "Hutang ditambahkan");
  });

  addButton.addEventListener("click", function () { openFormModal(null); });

  // --- Payment modal ---
  var payModal = document.getElementById("pay-modal");
  var payCustomerInfo = document.getElementById("pay-customer-info");
  var payDetail = document.getElementById("pay-detail");
  var confirmPayBtn = document.getElementById("confirm-pay-btn");
  var currentPayDebt = null;

  function openPayModal(debt) {
    currentPayDebt = debt;
    var total = calcTotal(debt);
    payCustomerInfo.innerHTML =
      '<p style="margin:0 0 0.3rem;font-weight:700">' + escapeHtml(debt.customerName) + "</p>" +
      '<p style="margin:0;color:var(--muted)">Total: <strong style="color:var(--text)">' + formatCurrency(total) + "</strong></p>";
    document.querySelector('input[name="pay-method"][value="QRIS"]').checked = true;
    updatePayDetail();
    payModal.hidden = false;
  }

  function updatePayDetail() {
    var method = document.querySelector('input[name="pay-method"]:checked').value;
    if (method === "QRIS") {
      payDetail.innerHTML =
        '<div class="pay-qr-box">' +
        '<div class="pay-qr-placeholder"></div>' +
        '<p class="pay-qr-hint">Scan QRIS di atas untuk membayar ' + formatCurrency(calcTotal(currentPayDebt)) + "</p>" +
        "</div>";
    } else if (method === "Transfer Bank") {
      payDetail.innerHTML =
        '<div class="pay-bank-info">' +
        "<p><strong>Bank BCA</strong> — 1234567890<br>a.n. Warung Sayur Diky</p>" +
        "<p><strong>Bank Mandiri</strong> — 9876543210<br>a.n. Warung Sayur Diky</p>" +
        "</div>";
    } else {
      payDetail.innerHTML = '<p style="text-align:center;color:var(--muted);margin:0">Pembayaran tunai diterima langsung di kasir.</p>';
    }
  }

  document.querySelectorAll('input[name="pay-method"]').forEach(function (r) {
    r.addEventListener("change", updatePayDetail);
  });

  confirmPayBtn.addEventListener("click", function () {
    if (!currentPayDebt) return;
    var method = document.querySelector('input[name="pay-method"]:checked').value;
    var idx = debts.findIndex(function (d) { return d.id === currentPayDebt.id; });
    if (idx > -1) {
      debts[idx].status = "lunas";
      debts[idx].paymentMethod = method;
      debts[idx].paymentDate = new Date().toISOString();
      saveData();
      renderList();
      payModal.hidden = true;
      showToast("Pembayaran berhasil!");
      openReceiptModal(debts[idx]);
    }
  });

  // --- Receipt modal ---
  var receiptModal = document.getElementById("receipt-modal");
  var receiptContent = document.getElementById("receipt-content");
  var printReceiptBtn = document.getElementById("print-receipt-btn");

  function openReceiptModal(debt) {
    var total = calcTotal(debt);
    var itemsHtml = (debt.items || []).map(function (i) {
      return (
        '<div class="receipt-item">' +
        "<span>" + escapeHtml(i.name) + " ×" + i.qty + "</span>" +
        "<span>" + formatCurrency((i.qty || 0) * (i.price || 0)) + "</span>" +
        "</div>"
      );
    }).join("");

    receiptContent.innerHTML =
      '<div class="receipt">' +
      '<div class="receipt-header">' +
      '<div class="receipt-brand">WS</div>' +
      "<h3>Warung Sayur Diky</h3>" +
      "<p>Sayuran segar, pilihan sehat untuk keluarga.</p>" +
      "</div>" +
      '<div class="receipt-meta">' +
      "<p>No: " + debt.id.slice(0, 8).toUpperCase() + "</p>" +
      "<p>Tanggal: " + formatDate(debt.date) + "</p>" +
      "<p>Pelanggan: " + escapeHtml(debt.customerName) + "</p>" +
      "<p>Pembayaran: " + (debt.paymentMethod || "-") + (debt.paymentDate ? " (" + formatDate(debt.paymentDate) + ")" : "") + "</p>" +
      "</div>" +
      '<div class="receipt-items">' + itemsHtml + "</div>" +
      '<div class="receipt-total">' +
      "<span>TOTAL</span>" +
      "<span>" + formatCurrency(total) + "</span>" +
      "</div>" +
      '<div class="receipt-status status-' + debt.status + '">' +
      (debt.status === "lunas" ? "✓ LUNAS" : "BELUM LUNAS") +
      "</div>" +
      '<div class="receipt-footer">Terima kasih telah berbelanja!</div>' +
      "</div>";
    receiptModal.hidden = false;
  }

  printReceiptBtn.addEventListener("click", function () {
    window.print();
  });

  // --- Detail / history modal ---
  var detailModal = document.getElementById("detail-modal");
  var detailContent = document.getElementById("detail-content");

  function openDetailModal(debt) {
    var customerName = (debt.customerName || "").toLowerCase();
    var customerDebts = debts.filter(function (d) { return (d.customerName || "").toLowerCase() === customerName; });
    var totalAll = customerDebts.reduce(function (s, d) { return s + calcTotal(d); }, 0);
    var paidCount = customerDebts.filter(function (d) { return d.status === "lunas"; }).length;

    var historyHtml = customerDebts.map(function (d) {
      var total = calcTotal(d);
      var itemsText = (d.items || []).map(function (i) { return i.name + " ×" + i.qty; }).join(", ");
      return (
        '<div class="history-item">' +
        '<div class="history-item-top">' +
        '<span class="history-date">' + formatDate(d.date) + "</span>" +
        '<span class="status-badge status-' + d.status + '">' + (d.status === "lunas" ? "Lunas" : "Belum") + "</span>" +
        "</div>" +
        '<p class="history-items">' + escapeHtml(itemsText) + "</p>" +
        '<p class="history-amount">' + formatCurrency(total) + "</p>" +
        "</div>"
      );
    }).join("");

    detailContent.innerHTML =
      '<div class="detail-header">' +
      '<div class="debt-avatar">' + getInitials(debt.customerName) + "</div>" +
      "<div>" +
      '<h3 style="margin:0">' + escapeHtml(debt.customerName) + "</h3>" +
      '<p style="margin:0;color:var(--muted)">' + (debt.phone ? escapeHtml(debt.phone) : "No. telp tidak tersedia") + "</p>" +
      "</div>" +
      "</div>" +
      '<div class="detail-stats">' +
      '<div class="detail-stat"><span class="detail-stat-value">' + customerDebts.length + '</span><span class="detail-stat-label">Transaksi</span></div>' +
      '<div class="detail-stat"><span class="detail-stat-value">' + paidCount + '</span><span class="detail-stat-label">Lunas</span></div>' +
      '<div class="detail-stat"><span class="detail-stat-value">' + formatCurrency(totalAll) + '</span><span class="detail-stat-label">Total Nilai</span></div>' +
      "</div>" +
      '<div class="history-list">' + historyHtml + "</div>";
    detailModal.hidden = false;
  }

  // --- WhatsApp ---
  function sendWhatsApp(debt) {
    var total = calcTotal(debt);
    var itemsText = (debt.items || []).map(function (i) {
      return "• " + i.name + " ×" + i.qty + " = " + formatCurrency((i.qty || 0) * (i.price || 0));
    }).join("\n");
    var msg =
      "Halo " + debt.customerName + ",\n\n" +
      "Ini pengingat tagihan di Warung Sayur Diky:\n\n" +
      itemsText + "\n\n" +
      "Total: *" + formatCurrency(total) + "*\n\n" +
      "Jatuh tempo: " + formatDate(debt.dueDate) + "\n\n" +
      "Terima kasih 🙏";
    var phone = (debt.phone || "").replace(/[^0-9]/g, "");
    var waPhone = phone;
    if (phone.indexOf("0") === 0) waPhone = "62" + phone.slice(1);
    else if (phone.indexOf("62") !== 0 && phone.length > 5) waPhone = "62" + phone;
    var url = "https://wa.me/" + waPhone + "?text=" + encodeURIComponent(msg);
    window.open(url, "_blank");
    showToast("Membuka WhatsApp...");
  }

  // --- Delete ---
  function deleteDebt(debt) {
    if (confirm("Hapus hutang " + debt.customerName + "?")) {
      debts = debts.filter(function (d) { return d.id !== debt.id; });
      saveData();
      renderList();
      showToast("Hutang dihapus");
    }
  }

  // --- Export / Import ---
  exportButton.addEventListener("click", function () {
    var data = JSON.stringify({ exportDate: new Date().toISOString(), debts: debts }, null, 2);
    var blob = new Blob([data], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "hutang-wsd-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Data diekspor");
  });

  importButton.addEventListener("click", function () { importFile.click(); });

  importFile.addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (data.debts && Array.isArray(data.debts)) {
          if (confirm("Impor akan mengganti semua data saat ini. Lanjutkan?")) {
            debts = data.debts;
            saveData();
            renderList();
            showToast("Data berhasil diimpor");
          }
        } else {
          showToast("Format file tidak valid");
        }
      } catch (err) {
        showToast("Gagal membaca file");
      }
    };
    reader.readAsText(file);
    importFile.value = "";
  });

  // --- Modal close handlers ---
  document.querySelectorAll("[data-close]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.getElementById(btn.getAttribute("data-close")).hidden = true;
    });
  });

  document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.hidden = true;
    });
  });

  // --- Search & filter ---
  searchInput.addEventListener("input", renderList);
  filterStatus.addEventListener("change", renderList);
  filterMonth.addEventListener("change", renderList);

  // --- Init ---
  renderList();
})();