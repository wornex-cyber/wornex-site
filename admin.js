const API_BASE =
  "https://wornex-api.onrender.com/api";

const token =
  sessionStorage.getItem("vornexToken");

const statusMessage =
  document.getElementById("statusMessage");

function redirectToHome() {
  window.location.replace("/");
}

function setStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className =
    `status ${type}`.trim();
}

function formatMoney(value) {
  return new Intl.NumberFormat(
    "tr-TR",
    {
      style: "currency",
      currency: "TRY",
    }
  ).format(Number(value || 0));
}

async function adminRequest(path) {
  const response = await fetch(
    `${API_BASE}${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  let data = {};

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Sunucudan geçersiz cevap geldi."
    );
  }

  if (
    response.status === 401 ||
    response.status === 403
  ) {
    sessionStorage.removeItem(
      "vornexToken"
    );
    sessionStorage.removeItem(
      "vornexUser"
    );

    redirectToHome();
    throw new Error(
      "Yönetici oturumu bulunamadı."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      "Admin verileri alınamadı."
    );
  }

  return data;
}

async function loadAdminPanel() {
  if (!token) {
    redirectToHome();
    return;
  }

  try {
    const [
      profileData,
      summaryData,
    ] = await Promise.all([
      adminRequest("/admin/me"),
      adminRequest("/admin/summary"),
    ]);

    const admin = profileData.admin;
    const summary = summaryData.summary;

    document.getElementById(
      "adminEmail"
    ).textContent = admin.email;

    document.getElementById(
      "totalUsers"
    ).textContent =
      summary.total_users;

    document.getElementById(
      "totalBalance"
    ).textContent =
      formatMoney(summary.total_balance);

    document.getElementById(
      "totalOrders"
    ).textContent =
      summary.total_orders;

    document.getElementById(
      "completedPayments"
    ).textContent =
      summary.completed_payments;

    document.getElementById(
      "totalPaymentAmount"
    ).textContent =
      formatMoney(
        summary.total_payment_amount
      );

    setStatus(
      "Yönetici paneli başarıyla yüklendi.",
      "success"
    );
  } catch (error) {
    setStatus(
      error.message ||
      "Panel yüklenemedi.",
      "error"
    );
  }
}

document.getElementById(
  "logoutButton"
).addEventListener(
  "click",
  () => {
    sessionStorage.removeItem(
      "vornexToken"
    );
    sessionStorage.removeItem(
      "vornexUser"
    );

    redirectToHome();
  }
);
function addTextCell(row, value) {
  const cell =
    document.createElement("td");

  cell.textContent =
    String(value ?? "—");

  row.appendChild(cell);
}

function addBadgeCell(
  row,
  text,
  className
) {
  const cell =
    document.createElement("td");

  const badge =
    document.createElement("span");

  badge.className = className;
  badge.textContent = text;

  cell.appendChild(badge);
  row.appendChild(cell);
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "tr-TR",
    {
      dateStyle: "short",
      timeStyle: "short",
    }
  ).format(new Date(value));
}

async function loadUsers() {
  const tableBody =
    document.getElementById(
      "usersTableBody"
    );

  tableBody.textContent = "";

  try {
    const data =
      await adminRequest("/admin/users");

    if (data.users.length === 0) {
      const row =
        document.createElement("tr");

      const cell =
        document.createElement("td");

      cell.colSpan = 6;
      cell.textContent =
        "Henüz kayıtlı kullanıcı yok.";

      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    data.users.forEach((user) => {
      const row =
        document.createElement("tr");

      addTextCell(row, user.id);
      addTextCell(row, user.email);

      addBadgeCell(
        row,
        user.role === "admin"
          ? "Yönetici"
          : "Müşteri",
        `role-badge ${user.role}`
      );

      addTextCell(
        row,
        formatMoney(user.balance)
      );

      addBadgeCell(
        row,
        user.phone_verified
          ? "Doğrulandı"
          : "Doğrulanmadı",
        user.phone_verified
          ? "phone-badge verified"
          : "phone-badge unverified"
      );

      addTextCell(
        row,
        formatDate(user.created_at)
      );

      tableBody.appendChild(row);
    });
  } catch (error) {
    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");

    cell.colSpan = 6;
    cell.textContent =
      error.message ||
      "Kullanıcılar yüklenemedi.";

    row.appendChild(cell);
    tableBody.appendChild(row);
  }
}

document.getElementById(
  "refreshUsers"
).addEventListener(
  "click",
  loadUsers
);
function paymentStatusText(status) {
  const statusNames = {
    completed: "Tamamlandı",
    pending: "Bekliyor",
    creating: "Oluşturuluyor",
    failed: "Başarısız",
  };

  return statusNames[status] || status;
}

async function loadPayments() {
  const tableBody =
    document.getElementById(
      "paymentsTableBody"
    );

  tableBody.textContent = "";

  try {
    const data =
      await adminRequest(
        "/admin/payments"
      );

    if (data.payments.length === 0) {
      const row =
        document.createElement("tr");

      const cell =
        document.createElement("td");

      cell.colSpan = 6;
      cell.textContent =
        "Henüz ödeme kaydı yok.";

      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    data.payments.forEach(
      (payment) => {
        const row =
          document.createElement("tr");

        addTextCell(row, payment.id);
        addTextCell(row, payment.email);

        addTextCell(
          row,
          formatMoney(payment.amount)
        );

        addBadgeCell(
          row,
          paymentStatusText(
            payment.status
          ),
          `payment-badge ${payment.status}`
        );

        addTextCell(
          row,
          payment.order_id || "—"
        );

        addTextCell(
          row,
          formatDate(
            payment.credited_at ||
            payment.created_at
          )
        );

        tableBody.appendChild(row);
      }
    );
  } catch (error) {
    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");

    cell.colSpan = 6;
    cell.textContent =
      error.message ||
      "Ödemeler yüklenemedi.";

    row.appendChild(cell);
    tableBody.appendChild(row);
  }
}

document.getElementById(
  "refreshPayments"
).addEventListener(
  "click",
  loadPayments
);
loadAdminPanel();
loadUsers();
loadPayments();
