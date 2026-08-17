const API_BASE = "https://wornex-api.onrender.com/api";
const ALLOWED_SERVICES = [
  "WhatsApp",
  "Telegram",
  "Instagram",
  "Google",
  "Facebook",
  "TikTok",
  "Discord",
  "Twitter",
  "X"
];

const MIN_SALE_PRICE = 500;
const PROFIT_MULTIPLIER = 1.5;

function getSalePrice(cost) {
  const supplierCost = Number(cost) || 0;
  return Math.ceil(
    Math.max(MIN_SALE_PRICE, supplierCost * PROFIT_MULTIPLIER)
  );
}

const countrySelect = document.querySelector("#country");
const serviceSelect = document.querySelector("#service");
const stockEl = document.querySelector("#stock");
const priceEl = document.querySelector("#price");
const cardsEl = document.querySelector("#cards");
const modal = document.querySelector("#modal");
const summaryEl = document.querySelector("#summary");
const ordersBody = document.querySelector("#ordersBody");
const confirmBtn = document.querySelector("#confirm");
const closeBtn = document.querySelector("#x");

// SmsOnayım yapısı:
// Kategori = Google / WhatsApp / Telegram vb.
// Servis = Türkiye / ABD / Almanya vb.
//
// Mevcut HTML'deki başlıkları JS ile doğru hale getiriyoruz.
try {
  countrySelect.parentElement.firstChild.textContent = "Servis";
  serviceSelect.parentElement.firstChild.textContent = "Ülke";
} catch (e) {}

let categories = [];
let currentServices = [];
let selectedCategory = null;
let selectedService = null;
let currentDetails = null;
let currentOrder = null;

// ----------------------------------------------------
// Yardımcı fonksiyon
// ----------------------------------------------------

async function apiFetch(path) {
  const response = await fetch(`${API_BASE}${path}`);

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Sunucudan geçersiz cevap geldi.");
  }

  if (!response.ok) {
    throw new Error(
      data?.message || "Sunucu bağlantısında bir hata oluştu."
    );
  }

  return data;
}

function setLoading(element, text = "Yükleniyor...") {
  element.innerHTML = `<option value="">${text}</option>`;
  element.disabled = true;
}

function formatPrice(value) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return `${value} TL`;
  }

  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(number);
}

function clearDetails() {
  stockEl.textContent = "—";
  priceEl.textContent = "Ülke seçin";
  selectedService = null;
  currentDetails = null;
}

// ----------------------------------------------------
// 1. Kategorileri getir
// Google / WhatsApp / Telegram / Discord vb.
// ----------------------------------------------------

async function loadCategories() {
  setLoading(countrySelect, "Servisler yükleniyor...");
  setLoading(serviceSelect, "Önce servis seçin");

  cardsEl.innerHTML = `
    <div class="card">
      <p>Servisler hazırlanıyor...</p>
    </div>
  `;

  try {
    categories = (await apiFetch("/categories")).filter(item =>
  ALLOWED_SERVICES.some(
    name => name.toLowerCase() === String(item.name).toLowerCase()
  )
);

    countrySelect.innerHTML =
      `<option value="">Servis seçin</option>` +
      categories
        .map(
          (item) =>
            `<option value="${item.id}">${item.name}</option>`
        )
        .join("");

    countrySelect.disabled = false;

    cardsEl.innerHTML = "";
  } catch (error) {
    console.error(error);

    countrySelect.innerHTML =
      `<option value="">Servisler alınamadı</option>`;

    cardsEl.innerHTML = `
      <div class="card">
        <h3>Bağlantı hatası</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}

// ----------------------------------------------------
// 2. Seçilen kategoriye ait ülkeleri getir
// ----------------------------------------------------

countrySelect.addEventListener("change", async () => {
  clearDetails();

  const categoryId = countrySelect.value;

  selectedCategory =
    categories.find(
      (item) => String(item.id) === String(categoryId)
    ) || null;

  if (!categoryId) {
    serviceSelect.innerHTML =
      `<option value="">Önce servis seçin</option>`;

    serviceSelect.disabled = true;
    cardsEl.innerHTML = "";
    return;
  }

  setLoading(serviceSelect, "Ülkeler yükleniyor...");

  cardsEl.innerHTML = `
    <div class="card">
      <p>Ülke seçenekleri yükleniyor...</p>
    </div>
  `;

  try {
    currentServices = await apiFetch(
      `/services/${categoryId}`
    );

    serviceSelect.innerHTML =
      `<option value="">Ülke seçin</option>` +
      currentServices
        .map(
          (item) =>
            `<option value="${item.id}">${item.name}</option>`
        )
        .join("");

    serviceSelect.disabled = false;

    renderCountryCards();
  } catch (error) {
    console.error(error);

    serviceSelect.innerHTML =
      `<option value="">Ülkeler alınamadı</option>`;

    cardsEl.innerHTML = `
      <div class="card">
        <h3>Ülkeler yüklenemedi</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
});

// ----------------------------------------------------
// Ülkeleri kart olarak göster
// ----------------------------------------------------

function renderCountryCards() {
  cardsEl.innerHTML = "";

  currentServices.slice(0, 12).forEach((item) => {
    const card = document.createElement("div");

    card.className = "card";

    card.innerHTML = `
      <b>🌍</b>
      <h3>${item.name}</h3>
      <p>
        ${selectedCategory?.name || "Servis"}
        için stok ve fiyatı görüntüle
      </p>

      <button
        type="button"
        data-service-id="${item.id}"
      >
        Seç
      </button>
    `;

    cardsEl.appendChild(card);
  });
}

cardsEl.addEventListener("click", (event) => {
  const button = event.target.closest(
    "button[data-service-id]"
  );

  if (!button) return;

  serviceSelect.value = button.dataset.serviceId;

  serviceSelect.dispatchEvent(
    new Event("change")
  );
});

// ----------------------------------------------------
// 3. Fiyat ve gerçek stok
// ----------------------------------------------------

serviceSelect.addEventListener("change", async () => {
  const serviceId = serviceSelect.value;

  clearDetails();

  if (!serviceId) return;

  selectedService =
    currentServices.find(
      (item) =>
        String(item.id) === String(serviceId)
    ) || null;

  stockEl.textContent = "...";
  priceEl.textContent = "Fiyat alınıyor...";

  try {
    currentDetails = await apiFetch(
      `/service/${serviceId}`
    );

    stockEl.textContent =
      currentDetails.stock ?? "0";

    const salePrice = getSalePrice(currentDetails.price);

priceEl.textContent =
  `${formatPrice(salePrice)} / işlem`;
  } catch (error) {
    console.error(error);

    stockEl.textContent = "Hata";
    priceEl.textContent =
      "Fiyat alınamadı";
  }
});

// ----------------------------------------------------
// Seçilen ülkeye tıklayınca sipariş önizlemesi
// ----------------------------------------------------

serviceSelect.addEventListener(
  "dblclick",
  openOrderModal
);

function openOrderModal() {
  if (
    !selectedCategory ||
    !selectedService ||
    !currentDetails
  ) {
    alert("Önce servis ve ülke seç.");
    return;
  }

  if (Number(currentDetails.stock) <= 0) {
    alert("Bu seçenek şu anda stokta yok.");
    return;
  }

  summaryEl.innerHTML = `
    <div>
      <span>Servis</span>
      <strong>
        ${selectedCategory.name}
      </strong>
    </div>

    <div>
      <span>Ülke</span>
      <strong>
        ${selectedService.name}
      </strong>
    </div>

    <div>
      <span>Stok</span>
      <strong>
        ${currentDetails.stock}
      </strong>
    </div>

    <div>
      <span>Tedarikçi Fiyatı</span>
      <strong>
        ${formatPrice(currentDetails.price)}
      </strong>
    </div>
  `;

  modal.classList.remove("hidden");
}

// Ülke seçildiğinde otomatik modal açma yerine
// karttan seçildikten sonra kullanıcı tekrar seçebilsin.
// Modal açmak için fiyat bölümüne tıklamayı da destekliyoruz.

priceEl.style.cursor = "pointer";

priceEl.addEventListener(
  "click",
  openOrderModal
);

closeBtn.addEventListener("click", () => {
  modal.classList.add("hidden");
});

// ----------------------------------------------------
// 4. GERÇEK NUMARA SİPARİŞİ
// ----------------------------------------------------

confirmBtn.addEventListener(
  "click",
  async () => {
    if (!selectedService) {
      alert("Önce ülke seç.");
      return;
    }

    const oldText = confirmBtn.textContent;

    confirmBtn.disabled = true;
    confirmBtn.textContent =
      "Numara hazırlanıyor...";

    try {
      const order = await apiFetch(
        `/order/${selectedService.id}`
      );

      if (!order.success || !order.number) {
        throw new Error(
          order.message ||
            "Numara alınamadı."
        );
      }

      currentOrder = {
        numberId: order.number_id,
        number: order.number,
        category:
          selectedCategory?.name || "",
        country:
          selectedService?.name || "",
        status: "Mesaj bekleniyor",
      };

      addOrderToTable(currentOrder);

      modal.classList.add("hidden");

      alert(
        `Numaran hazır:\n${order.number}\n\nSMS kodu bekleniyor.`
      );

      startMessagePolling(
        currentOrder.numberId
      );
    } catch (error) {
      console.error(error);

      alert(
        `Sipariş oluşturulamadı:\n${error.message}`
      );
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = oldText;
    }
  }
);

// ----------------------------------------------------
// Sipariş tablosu
// ----------------------------------------------------

function addOrderToTable(order) {
  if (
    ordersBody.rows.length === 1 &&
    ordersBody.rows[0].cells.length === 1
  ) {
    ordersBody.innerHTML = "";
  }

  const row = document.createElement("tr");

  row.dataset.numberId = order.numberId;

  row.innerHTML = `
    <td>
      VNX-${order.numberId}
    </td>

    <td>
      ${order.category}
      <br>
      <small>${order.country}</small>
    </td>

    <td>
      <strong>${order.number}</strong>
    </td>

    <td class="order-status">
      <span style="color:#f0b94d">
        ● SMS bekleniyor
      </span>
    </td>
  `;

  ordersBody.prepend(row);
}

// ----------------------------------------------------
// 5. SMS kodunu otomatik kontrol et
// ----------------------------------------------------

function startMessagePolling(numberId) {
  let attempts = 0;

  const interval = setInterval(
    async () => {
      attempts++;

      try {
        const result = await apiFetch(
          `/message/${numberId}`
        );

        const row =
          ordersBody.querySelector(
            `tr[data-number-id="${numberId}"]`
          );

        const statusCell =
          row?.querySelector(".order-status");

        // SMS geldi
        if (Number(result.status) === 1) {
          clearInterval(interval);

          if (statusCell) {
            statusCell.innerHTML = `
              <span style="color:#4be28b">
                ✓ Kod: <strong>
                  ${result.code}
                </strong>
              </span>
            `;
          }

          alert(
            `SMS kodu geldi:\n${result.code}`
          );

          return;
        }

        // Numara iptal edildi
        if (Number(result.status) === -1) {
          clearInterval(interval);

          if (statusCell) {
            statusCell.innerHTML = `
              <span style="color:#ff5577">
                ● İptal edildi
              </span>
            `;
          }

          return;
        }

        if (statusCell) {
          statusCell.innerHTML = `
            <span style="color:#f0b94d">
              ● SMS bekleniyor
            </span>
          `;
        }

        // Yaklaşık 10 dakika sonra dur
        if (attempts >= 60) {
          clearInterval(interval);

          if (statusCell) {
            statusCell.innerHTML = `
              <span style="color:#aaa">
                ● Bekleme süresi doldu
              </span>
            `;
          }
        }
      } catch (error) {
        console.error(
          "SMS kontrol hatası:",
          error
        );
      }
    },
    10000
  );
}

// ----------------------------------------------------
// Başlat
// ----------------------------------------------------

loadCategories();
document.querySelector("#loginBtn")?.addEventListener("click", () => {
  alert("Giriş ekranı hazırlanıyor.");
});

document.querySelector("#registerBtn")?.addEventListener("click", () => {
  alert("Kayıt ekranı hazırlanıyor.");
});
