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

loadAdminPanel();
