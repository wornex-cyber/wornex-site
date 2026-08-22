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
const SERVICE_ICONS = {
  WhatsApp: "fa-brands fa-whatsapp",
  Telegram: "fa-brands fa-telegram",
  Instagram: "fa-brands fa-instagram",
  Google: "fa-brands fa-google",
  Facebook: "fa-brands fa-facebook-f",
  TikTok: "fa-brands fa-tiktok",
  Discord: "fa-brands fa-discord",
  Twitter: "fa-brands fa-x-twitter",
  X: "fa-brands fa-x-twitter"
};

function getServiceIcon(serviceName) {
  const normalizedName =
    String(serviceName || "").toLowerCase();

  const matchedService =
    Object.keys(SERVICE_ICONS).find(
      (name) =>
        name.toLowerCase() === normalizedName
    );

  const iconClass =
    SERVICE_ICONS[matchedService] ||
    "fa-solid fa-mobile-screen-button";

  return `<i class="${iconClass}"></i>`;
}
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
const countrySearchInput =
  document.querySelector(
    ".vornex-country-column .vornex-search-box input"
  );

const serviceSearchInput =
  document.querySelector(
    ".vornex-services-column .vornex-search-box input"
  );
const modal = document.querySelector("#modal");
const summaryEl = document.querySelector("#summary");
const ordersBody = document.querySelector("#ordersBody");
const confirmBtn = document.querySelector("#confirm");
const closeBtn = document.querySelector("#x");
const openOrderPreviewBtn =
  document.querySelector("#openOrderPreview");
const orderPlaceholderEl =
  document.querySelector(
    ".vornex-order-placeholder"
  );
const buySteps =
  document.querySelectorAll(".buy-step");
const phoneVerifyModal =
  document.querySelector("#phoneVerifyModal");

const phoneVerifyClose =
  document.querySelector("#phoneVerifyClose");

const phoneStartStep =
  document.querySelector("#phoneStartStep");

const phoneCodeStep =
  document.querySelector("#phoneCodeStep");

const verifyPhoneInput =
  document.querySelector("#verifyPhoneInput");

const verifyCodeInput =
  document.querySelector("#verifyCodeInput");

const sendVerifyCodeBtn =
  document.querySelector("#sendVerifyCodeBtn");

const checkVerifyCodeBtn =
  document.querySelector("#checkVerifyCodeBtn");

const phoneVerifyMessage =
  document.querySelector("#phoneVerifyMessage");

let activeVerificationPhone = "";
function setBuyStep(step) {
  buySteps.forEach((item, index) => {
    const stepNumber = index + 1;

    item.classList.toggle(
      "completed",
      stepNumber < step
    );

    item.classList.toggle(
      "active",
      stepNumber === step
    );
  });
}

// SmsOnayım yapısı:
// Kategori = Google / WhatsApp / Telegram vb.
// Servis = Türkiye / ABD / Almanya vb.
//
// Mevcut HTML'deki başlıkları JS ile doğru hale getiriyoruz.


let categories = [];
let currentServices = [];
let selectedCategory = null;
let selectedService = null;
let currentDetails = null;
let currentOrder = null;

// ----------------------------------------------------
// Yardımcı fonksiyon
// ----------------------------------------------------

async function apiFetch(path, options = {}) {
  const token = sessionStorage.getItem("vornexToken");

 const response = await fetch(`${API_BASE}${path}`, {
  ...options,
  headers: {
    ...(options.headers || {}),
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
  },
});

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Sunucudan geçersiz cevap geldi.");
  }

  if (!response.ok) {
  const errorMessage =
    data?.error ||
    data?.message ||
    "Sunucu bağlantısında bir hata oluştu.";

  if (response.status === 401) {
    sessionStorage.removeItem("vornexToken");
    sessionStorage.removeItem("vornexUser");

    setTimeout(() => {
      openAuthModal("login");
    }, 100);
  }

    const requestError =
    new Error(errorMessage);

  requestError.code =
    data?.code || "";

  throw requestError;
}

  return data;
}
async function apiPost(path, body) {
  const token =
    sessionStorage.getItem("vornexToken");

  const response = await fetch(
    `${API_BASE}${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
      },
      body: JSON.stringify(body),
    }
  );

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "Sunucudan geçersiz cevap geldi."
    );
  }

  if (!response.ok) {
    const errorMessage =
      data?.error ||
      data?.message ||
      "Sunucu bağlantısında bir hata oluştu.";

    if (response.status === 401) {
      sessionStorage.removeItem(
        "vornexToken"
      );

      sessionStorage.removeItem(
        "vornexUser"
      );

      setTimeout(() => {
        openAuthModal("login");
      }, 100);
    }

    throw new Error(errorMessage);
  }

  return data;
}
function setPhoneVerifyMessage(
  message,
  type = ""
) {
  phoneVerifyMessage.textContent = message;

  phoneVerifyMessage.classList.remove(
    "error",
    "success"
  );

  if (type) {
    phoneVerifyMessage.classList.add(type);
  }
}

function resetPhoneVerificationModal() {
  activeVerificationPhone = "";

  verifyPhoneInput.value = "";
  verifyCodeInput.value = "";

  phoneStartStep.classList.remove("hidden");
  phoneCodeStep.classList.add("hidden");

  sendVerifyCodeBtn.disabled = false;
  checkVerifyCodeBtn.disabled = false;

  sendVerifyCodeBtn.textContent =
    "Doğrulama Kodu Gönder";

  checkVerifyCodeBtn.textContent =
    "Telefonu Doğrula";

  setPhoneVerifyMessage("");
}

function openPhoneVerificationModal(
  phone = ""
) {
  resetPhoneVerificationModal();

  if (phone) {
    verifyPhoneInput.value = phone;
  }

  phoneVerifyModal.classList.remove(
    "hidden"
  );

  verifyPhoneInput.focus();
}

function closePhoneVerificationModal() {
  phoneVerifyModal.classList.add("hidden");

  resetPhoneVerificationModal();
}
sendVerifyCodeBtn?.addEventListener(
  "click",
  async () => {
    const token =
      sessionStorage.getItem("vornexToken");

    if (!token) {
      closePhoneVerificationModal();
      openAuthModal("login");
      return;
    }

    const phone = String(
      verifyPhoneInput.value || ""
    )
      .replace(/\s+/g, "")
      .replace(/[()-]/g, "");

    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      setPhoneVerifyMessage(
        "Telefon numaranı +905xxxxxxxxx formatında gir.",
        "error"
      );

      return;
    }

    const oldText =
      sendVerifyCodeBtn.textContent;

    sendVerifyCodeBtn.disabled = true;
    sendVerifyCodeBtn.textContent =
      "Kod gönderiliyor...";

    setPhoneVerifyMessage("");

    try {
      const result = await apiPost(
        "/verify/start",
        {
          phone,
        }
      );

      activeVerificationPhone = phone;

      phoneStartStep.classList.add(
        "hidden"
      );

      phoneCodeStep.classList.remove(
        "hidden"
      );

      setPhoneVerifyMessage(
        result.message ||
          "Doğrulama kodu gönderildi.",
        "success"
      );

      verifyCodeInput.focus();
    } catch (error) {
      setPhoneVerifyMessage(
        error.message,
        "error"
      );
    } finally {
      sendVerifyCodeBtn.disabled = false;
      sendVerifyCodeBtn.textContent =
        oldText;
    }
  }
);
checkVerifyCodeBtn?.addEventListener(
  "click",
  async () => {
    const code = String(
      verifyCodeInput.value || ""
    ).trim();

    if (!activeVerificationPhone) {
      setPhoneVerifyMessage(
        "Önce telefonuna doğrulama kodu gönder.",
        "error"
      );

      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setPhoneVerifyMessage(
        "Telefona gelen 6 haneli kodu gir.",
        "error"
      );

      return;
    }

    const oldText =
      checkVerifyCodeBtn.textContent;

    checkVerifyCodeBtn.disabled = true;
    checkVerifyCodeBtn.textContent =
      "Kontrol ediliyor...";

    setPhoneVerifyMessage("");

    try {
      const result = await apiPost(
        "/verify/check",
        {
          phone: activeVerificationPhone,
          code,
        }
      );

      if (!result.verified) {
        throw new Error(
          result.message ||
            "Doğrulama tamamlanamadı."
        );
      }

      setPhoneVerifyMessage(
        result.message ||
          "Telefon numarası doğrulandı.",
        "success"
      );

      await renderAccountPanel();

      setTimeout(() => {
        closePhoneVerificationModal();
      }, 1200);
    } catch (error) {
      setPhoneVerifyMessage(
        error.message,
        "error"
      );
    } finally {
      checkVerifyCodeBtn.disabled = false;
      checkVerifyCodeBtn.textContent =
        oldText;
    }
  }
);
phoneVerifyClose?.addEventListener(
  "click",
  closePhoneVerificationModal
);

phoneVerifyModal?.addEventListener(
  "click",
  (event) => {
    if (event.target === phoneVerifyModal) {
      closePhoneVerificationModal();
    }
  }
);
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
  openOrderPreviewBtn.disabled = true;
}

// ----------------------------------------------------
// 1. Kategorileri getir
// Google / WhatsApp / Telegram / Discord vb.
// ----------------------------------------------------

async function loadCategories() {
  setLoading(countrySelect, "Servisler yükleniyor...");
  setLoading(serviceSelect, "Önce servis seçin");

  cardsEl.innerHTML = `
  <div class="premium-empty-selection">
    <div>⏳</div>
    <strong>Servisler yükleniyor</strong>
    <span>Lütfen kısa bir süre bekle.</span>
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
renderServiceChoices();
    cardsEl.innerHTML = `
  <div class="premium-empty-selection">
    <div>🌍</div>
    <strong>Önce bir servis seç</strong>
    <span>
      Kullanılabilir ülkeleri görmek için yukarıdan servis seçimi yap.
    </span>
  </div>
`;
  } catch (error) {
    console.error(error);

    countrySelect.innerHTML =
      `<option value="">Servisler alınamadı</option>`;

   cardsEl.innerHTML = `
  <div class="premium-empty-selection">
    <div>⚠️</div>
    <strong>Servisler yüklenemedi</strong>
    <span>${error.message}</span>
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
  setBuyStep(categoryId ? 2 : 1);

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
  <div class="premium-empty-selection">
    <div>⏳</div>
    <strong>Ülkeler yükleniyor</strong>
    <span>Uygun ülkeler hazırlanıyor.</span>
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
  <div class="premium-empty-selection">
    <div>⚠️</div>
    <strong>Ülkeler yüklenemedi</strong>
    <span>${error.message}</span>
  </div>
`;
  }
});

// ----------------------------------------------------
// Ülkeleri kart olarak göster
// ----------------------------------------------------

function renderCountryCards(list = currentServices) {
  cardsEl.innerHTML = "";
if (list.length === 0) {
  cardsEl.innerHTML = `
    <div class="premium-empty-selection">
      <div>🔎</div>
      <strong>Ülke bulunamadı</strong>
      <span>Aramana uygun ülke yok.</span>
    </div>
  `;

  return;
}
  list.forEach((item) => {
    const card = document.createElement("div");

    card.className = `card ${
  String(item.id) === String(serviceSelect.value)
    ? "active"
    : ""
}`;

    card.innerHTML = `
      <b>🌍</b>
      <h3>${item.name}</h3>
      <p>
        ${getServiceIcon(selectedCategory?.name || "")}
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
countrySearchInput?.addEventListener("input", () => {
  const query =
    countrySearchInput.value
      .trim()
      .toLocaleLowerCase("tr-TR");

  const filteredCountries =
    currentServices.filter((item) =>
      String(item.name || "")
        .toLocaleLowerCase("tr-TR")
        .includes(query)
    );

  renderCountryCards(filteredCountries);
});
cardsEl.addEventListener("click", (event) => {
  const button = event.target.closest(
    "button[data-service-id]"
  );

  if (!button) return;

  serviceSelect.value = button.dataset.serviceId;
renderCountryCards();
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
  setBuyStep(serviceId ? 3 : 2);

  if (!serviceId) return;

  selectedService =
    currentServices.find(
      (item) =>
        String(item.id) === String(serviceId)
    ) || null;
if (orderPlaceholderEl && selectedCategory && selectedService) {
  orderPlaceholderEl.innerHTML = `
    <div class="vornex-order-placeholder-icon">
      ${getServiceIcon(selectedCategory.name)}
    </div>

    <strong>
      ${selectedCategory.name} • ${selectedService.name}
    </strong>

    <p>
      Seçimin hazır. Canlı stok ve fiyat bilgileri aşağıda.
    </p>
  `;
}
  stockEl.textContent = "...";
  priceEl.textContent = "Fiyat alınıyor...";
  openOrderPreviewBtn.textContent = "Stok kontrol ediliyor...";

  try {
    currentDetails = await apiFetch(
      `/service/${serviceId}`
    );

    stockEl.textContent =
      currentDetails.stock ?? "0";

    const salePrice = getSalePrice(currentDetails.price);

priceEl.textContent =
  `${formatPrice(salePrice)} / işlem`;
    openOrderPreviewBtn.disabled =
  Number(currentDetails.stock) <= 0;
    openOrderPreviewBtn.textContent =
  Number(currentDetails.stock) <= 0
    ? "Stokta Yok"
    : "Siparişi Önizle →";
    if (Number(currentDetails.stock) <= 0) {
  priceEl.textContent = "Şu anda stok yok";
}
  } catch (error) {
  console.error(error);

  stockEl.textContent = "Hata";
  priceEl.textContent = "Fiyat alınamadı";
  openOrderPreviewBtn.disabled = true;
  openOrderPreviewBtn.textContent = "Bilgi alınamadı";
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

  const salePrice = getSalePrice(currentDetails.price);

  summaryEl.innerHTML = `
    <div>
      <span>Servis</span>
      <strong>
  ${getServiceIcon(selectedCategory.name)}
  ${selectedCategory.name}
</strong>
    </div>

    <div>
      <span>Ülke</span>
      <strong>${selectedService.name}</strong>
    </div>

    <div>
      <span>Stok</span>
      <strong>${currentDetails.stock}</strong>
    </div>

    <div>
      <span>Fiyat</span>
      <strong>${formatPrice(salePrice)}</strong>
    </div>
  `;
setBuyStep(4);
  modal.classList.remove("hidden");
}
// Ülke seçildiğinde otomatik modal açma yerine
// karttan seçildikten sonra kullanıcı tekrar seçebilsin.
// Modal açmak için fiyat bölümüne tıklamayı da destekliyoruz.

priceEl.classList.add("service-price-clickable");

priceEl.addEventListener(
  "click",
  openOrderModal
);
openOrderPreviewBtn.addEventListener(
  "click",
  openOrderModal
);
closeBtn.addEventListener("click", () => {
  modal.classList.add("hidden");
  setBuyStep(3);
});

// ----------------------------------------------------
// 4. GERÇEK NUMARA SİPARİŞİ
// ----------------------------------------------------

confirmBtn.addEventListener(
  "click",
  async () => {
    const token = sessionStorage.getItem("vornexToken");

if (!token) {
  alert("Sipariş vermek için giriş yapmalısın.");
  openAuthModal("login");
  return;
}
    if (!selectedService) {
      alert("Önce ülke seç.");
      return;
    }
const account = await apiFetch("/me");
const currentBalance = Number(account.user?.balance || 0);
const requiredBalance = getSalePrice(currentDetails.price);

if (currentBalance < requiredBalance) {
  const missingBalance =
    requiredBalance - currentBalance;

  const balanceModal =
    document.createElement("div");

  balanceModal.className =
    "modal balance-warning-modal";

  balanceModal.innerHTML = `
    <div class="box balance-warning-box">

      <button
        type="button"
        class="balance-warning-close"
        aria-label="Kapat"
      >
        ×
      </button>

      <span class="section-kicker">
        BAKİYE YETERSİZ
      </span>

      <h2>Siparişi tamamlamak için bakiye yükle</h2>

      <p class="balance-warning-text">
        Hesabındaki bakiye bu sipariş için yeterli değil.
      </p>

      <div class="balance-warning-grid">

        <div>
          <span>Mevcut Bakiye</span>
          <strong>
            ${formatPrice(currentBalance)}
          </strong>
        </div>

        <div>
          <span>Gerekli Tutar</span>
          <strong>
            ${formatPrice(requiredBalance)}
          </strong>
        </div>

        <div class="balance-warning-missing">
          <span>Eksik Tutar</span>
          <strong>
            ${formatPrice(missingBalance)}
          </strong>
        </div>

      </div>

      <button
        type="button"
        class="primary-btn balance-warning-topup"
      >
        Bakiye Yükle →
      </button>

    </div>
  `;

  document.body.appendChild(balanceModal);

  balanceModal
    .querySelector(".balance-warning-close")
    .addEventListener("click", () => {
      balanceModal.remove();
    });

  balanceModal
    .querySelector(".balance-warning-topup")
    .addEventListener("click", () => {
      location.href = "topup.html";
    });

  balanceModal.addEventListener(
    "click",
    (event) => {
      if (event.target === balanceModal) {
        balanceModal.remove();
      }
    }
  );

  return;
}

  
    const oldText = confirmBtn.textContent;

    confirmBtn.disabled = true;
    confirmBtn.textContent =
      "Numara hazırlanıyor...";

    try {
      const order = await apiFetch(
  `/order/${selectedService.id}?categoryName=${encodeURIComponent(selectedCategory?.name || "")}&countryName=${encodeURIComponent(selectedService?.name || "")}`,
  {
    method: "POST",
  }
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
      if (
        error.code ===
        "PHONE_VERIFICATION_REQUIRED"
      ) {
        modal.classList.add("hidden");

        openPhoneVerificationModal();

        return;
      }
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
function renderServiceChoices(list = categories) {
  const container =
    document.querySelector("#serviceChoices");

  if (!container) return;
  if (list.length === 0) {
  container.innerHTML = `
    <div class="premium-empty-selection">
      <div>🔎</div>
      <strong>Servis bulunamadı</strong>
      <span>Aramana uygun servis yok.</span>
    </div>
  `;

  return;
}

  container.innerHTML = list
    .map((item) => `
      <button
        type="button"
        class="vornex-service-choice ${String(item.id) === String(countrySelect.value) ? "active" : ""}"
        data-category-id="${item.id}"
      >
        <span class="vornex-service-choice-icon">
          ${getServiceIcon(item.name)}
        </span>

        <span class="vornex-service-choice-name">
          ${item.name}
        </span>
      </button>
    `)
    .join("");
}
serviceSearchInput?.addEventListener("input", () => {
  const query =
    serviceSearchInput.value
      .trim()
      .toLocaleLowerCase("tr-TR");

  const filteredServices =
    categories.filter((item) =>
      String(item.name || "")
        .toLocaleLowerCase("tr-TR")
        .includes(query)
    );

  renderServiceChoices(filteredServices);
});
document
  .querySelector("#serviceChoices")
  ?.addEventListener("click", (event) => {
    const button =
      event.target.closest(
        ".vornex-service-choice"
      );

    if (!button) return;

    countrySelect.value =
      button.dataset.categoryId;
serviceSearchInput?.dispatchEvent(
  new Event("input")
);
    countrySelect.dispatchEvent(
      new Event("change")
    );
  });
loadCategories();

function openAuthModal(mode) {
  const oldModal = document.querySelector("#authModal");

  if (oldModal) {
    oldModal.remove();
  }

  const isLogin = mode === "login";

  const modal = document.createElement("div");

  modal.id = "authModal";

   modal.className = "vornex-auth-overlay";

  modal.innerHTML = `
    <div class="vornex-auth-card">

      <div class="vornex-auth-header">
        <h2 class="vornex-auth-title">
          ${isLogin ? "Giriş Yap" : "Kayıt Ol"}
        </h2>

        <button
          id="authClose"
          class="vornex-auth-close"
          type="button"
        >×</button>
      </div>

      <input
        id="authEmail"
        class="vornex-auth-input"
        type="email"
        placeholder="E-posta"
        autocomplete="email"
      >

      <input
        id="authPassword"
        class="vornex-auth-input"
        type="password"
        placeholder="Şifre"
        autocomplete="${isLogin ? "current-password" : "new-password"}"
      >

      <button
        id="authSubmit"
        class="vornex-auth-submit"
        type="button"
      >
        ${isLogin ? "Giriş Yap" : "Hesap Oluştur"}
      </button>

      <p
        id="authMessage"
        class="vornex-auth-message"
      ></p>

      <button
        id="authSwitch"
        class="vornex-auth-switch"
        type="button"
      >
        ${
          isLogin
            ? "Hesabın yok mu? Kayıt Ol"
            : "Zaten hesabın var mı? Giriş Yap"
        }
      </button>

    </div>
  `;
  document.body.appendChild(modal);

  document.querySelector("#authClose").onclick = () => {
    modal.remove();
  };

  document.querySelector("#authSwitch").onclick = () => {
    modal.remove();
    openAuthModal(isLogin ? "register" : "login");
  };

  document.querySelector("#authSubmit").onclick =
    async () => {

      const email =
        document.querySelector("#authEmail").value.trim();

      const password =
        document.querySelector("#authPassword").value;

      const message =
        document.querySelector("#authMessage");

      const submit =
        document.querySelector("#authSubmit");

      if (!email || !password) {
        message.textContent =
          "E-posta ve şifre gerekli.";
        return;
      }
if (
  !isLogin &&
  (
    password.length < 8 ||
    password.length > 128
  )
) {
  message.textContent =
    "Şifre 8–128 karakter arasında olmalı.";
  return;
}
      submit.disabled = true;
      submit.textContent = "Bekleyin...";

      try {
        const response = await fetch(
          `${API_BASE}/${isLogin ? "login" : "register"}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email,
              password,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Bir hata oluştu."
          );
        }

        sessionStorage.setItem(
          "vornexUser",
          JSON.stringify(data.user)
        );
        sessionStorage.setItem("vornexToken", data.token);
        await renderAccountPanel();
        message.textContent =
          isLogin
            ? "Giriş başarılı."
            : "Hesabın oluşturuldu.";

        setTimeout(() => {
          modal.remove();
        }, 800);

      } catch (error) {
        message.textContent =
          error.message;
      } finally {
        submit.disabled = false;
        submit.textContent =
          isLogin
            ? "Giriş Yap"
            : "Hesap Oluştur";
      }
    };
}

document
  .querySelector("#loginBtn")
  ?.addEventListener("click", () => {
    openAuthModal("login");
  });

document
  .querySelector("#registerBtn")
  ?.addEventListener("click", () => {
    openAuthModal("register");
  });
async function renderAccountPanel() {
  const token = sessionStorage.getItem("vornexToken");

  if (!token) {
    return;
  }

  try {
    const result = await apiFetch("/me");
    const user = result.user;

    sessionStorage.setItem(
      "vornexUser",
      JSON.stringify(user)
    );
    if (!user.phone_verified) {
      setTimeout(() => {
        openPhoneVerificationModal(
          user.phone || ""
        );
      }, 300);
    }
    document
      .querySelector("#accountPanel")
      ?.remove();

    const panel = document.createElement("section");

    panel.id = "accountPanel";
    panel.className = "account-panel panel-section";

    panel.innerHTML = `
      <div class="account-panel-head">
        <div>
          <span class="section-kicker">
            VORNEX PANEL
          </span>

          <h2>Hesabım</h2>

          <p>
            ${user.email}
          </p>
        </div>

        <button
          type="button"
          id="panelLogoutBtn"
          class="ghost-btn"
        >
          Çıkış Yap
        </button>
      </div>

      <div class="account-grid">

        <div class="account-balance-card">
          <span>GÜNCEL BAKİYE</span>

          <strong>
            ${formatPrice(user.balance)}
          </strong>

          <p>
            Kullanılabilir hesap bakiyen
          </p>

          <button
            type="button"
            id="panelTopupBtn"
            class="primary-btn"
          >
            + Bakiye Yükle
          </button>
        </div>

        <div class="account-action-card">
          <span>HIZLI İŞLEM</span>

          <h3>Yeni numara al</h3>

          <p>
            Servis ve ülke seçerek yeni
            sipariş oluştur.
          </p>

          <button
            type="button"
            id="panelBuyBtn"
            class="ghost-btn"
          >
            Numara Al →
          </button>
        </div>

        <div class="account-action-card">
          <span>SİPARİŞLER</span>

          <h3>Aktif işlemler</h3>

          <p>
            SMS bekleyen ve tamamlanan
            siparişlerini takip et.
          </p>

          <button
            type="button"
            id="panelOrdersBtn"
            class="ghost-btn"
          >
            Siparişlere Git →
          </button>
        </div>
        <div class="account-action-card">
          <span>TELEFON GÜVENLİĞİ</span>

          <h3>
            ${
              user.phone_verified
                ? "Telefon doğrulandı"
                : "Doğrulama gerekli"
            }
          </h3>

          <p>
            ${
              user.phone_verified
                ? user.phone ||
                  "Telefon numaran doğrulandı."
                : "Sipariş verebilmek için telefonunu doğrula."
            }
          </p>

          <button
            type="button"
            id="panelVerifyPhoneBtn"
            class="${
              user.phone_verified
                ? "ghost-btn"
                : "primary-btn"
            }"
            ${
              user.phone_verified
                ? "disabled"
                : ""
            }
          >
            ${
              user.phone_verified
                ? "✓ Doğrulandı"
                : "Telefonunu Doğrula →"
            }
          </button>
        </div>
      </div>
    `;

    const hero = document.querySelector(".vornex-hero");

    if (hero) {
      hero.insertAdjacentElement(
        "afterend",
        panel
      );
    }

    document
      .querySelector("#panelBuyBtn")
      ?.addEventListener("click", () => {
        document
          .querySelector("#services")
          ?.scrollIntoView({
            behavior: "smooth",
          });
      });
    document
      .querySelector("#panelVerifyPhoneBtn")
      ?.addEventListener("click", () => {
        if (!user.phone_verified) {
          openPhoneVerificationModal(
            user.phone || ""
          );
        }
      });

    document
      .querySelector("#panelOrdersBtn")
      ?.addEventListener("click", () => {
        document
          .querySelector("#orders")
          ?.scrollIntoView({
            behavior: "smooth",
          });
      });

    document
      .querySelector("#panelTopupBtn")
      ?.addEventListener("click", () => {
        alert(
          "Bakiye yükleme ekranını birazdan ekleyeceğiz."
        );
      });

    document
      .querySelector("#panelLogoutBtn")
      ?.addEventListener("click", () => {
        sessionStorage.removeItem(
          "vornexToken"
        );

        sessionStorage.removeItem(
          "vornexUser"
        );

        location.reload();
      });

  } catch (error) {
    console.error(
      "Panel yüklenemedi:",
      error
    );
  }
}

renderAccountPanel();
