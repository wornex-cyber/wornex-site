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
const openOrderPreviewBtn =
  document.querySelector("#openOrderPreview");
const buySteps =
  document.querySelectorAll(".buy-step");
function setBuyStep(step) {
  buySteps.forEach((item, index) => {
    item.classList.toggle(
      "active",
      index < step
    );
  });
}

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
  const token = sessionStorage.getItem("vornexToken");

  const response = await fetch(`${API_BASE}${path}`, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
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

  throw new Error(errorMessage);
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
  setBuyStep(serviceId ? 3 : 2);

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
    openOrderPreviewBtn.disabled =
  Number(currentDetails.stock) <= 0;
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

  const salePrice = getSalePrice(currentDetails.price);

  summaryEl.innerHTML = `
    <div>
      <span>Servis</span>
      <strong>${selectedCategory.name}</strong>
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

priceEl.style.cursor = "pointer";

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

function openAuthModal(mode) {
  const oldModal = document.querySelector("#authModal");

  if (oldModal) {
    oldModal.remove();
  }

  const isLogin = mode === "login";

  const modal = document.createElement("div");

  modal.id = "authModal";

  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
  `;

  modal.innerHTML = `
    <div style="
      width:100%;
      max-width:420px;
      background:#111;
      border:1px solid #333;
      border-radius:18px;
      padding:28px;
      color:white;
    ">

      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom:20px;
      ">
        <h2 style="margin:0">
          ${isLogin ? "Giriş Yap" : "Kayıt Ol"}
        </h2>

        <button
          id="authClose"
          type="button"
          style="
            background:none;
            border:0;
            color:#aaa;
            font-size:24px;
            cursor:pointer;
          "
        >×</button>
      </div>

      <input
        id="authEmail"
        type="email"
        placeholder="E-posta"
        autocomplete="email"
        style="
          width:100%;
          box-sizing:border-box;
          margin-bottom:12px;
          padding:13px;
          border-radius:10px;
          border:1px solid #333;
          background:#181818;
          color:white;
        "
      >

      <input
        id="authPassword"
        type="password"
        placeholder="Şifre"
        autocomplete="${isLogin ? "current-password" : "new-password"}"
        style="
          width:100%;
          box-sizing:border-box;
          margin-bottom:16px;
          padding:13px;
          border-radius:10px;
          border:1px solid #333;
          background:#181818;
          color:white;
        "
      >

      <button
        id="authSubmit"
        type="button"
        style="
          width:100%;
          padding:13px;
          border:0;
          border-radius:10px;
          cursor:pointer;
          font-weight:600;
        "
      >
        ${isLogin ? "Giriş Yap" : "Hesap Oluştur"}
      </button>

      <p
        id="authMessage"
        style="
          margin:14px 0 0;
          text-align:center;
          min-height:20px;
          color:#aaa;
        "
      ></p>

      <button
        id="authSwitch"
        type="button"
        style="
          width:100%;
          margin-top:10px;
          background:none;
          border:0;
          color:#aaa;
          cursor:pointer;
        "
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

      </div>
    `;

    const hero = document.querySelector(".hero");

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
