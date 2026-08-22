const API_BASE = "https://wornex-api.onrender.com/api";

    async function loadAccount() {
      const token = sessionStorage.getItem("vornexToken");

      if (!token) {
        location.href = "index.html";
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/me`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
            data.message ||
            "Hesap bilgileri alınamadı."
          );
        }

        const user = data.user || {};

        document.querySelector("#panelUserEmail").textContent =
          user.email || "Kullanıcı";

        document.querySelector("#panelBalance").textContent =
          new Intl.NumberFormat("tr-TR", {
            style: "currency",
            currency: "TRY"
          }).format(Number(user.balance || 0));

      } catch (error) {
        console.error(error);

        sessionStorage.removeItem("vornexToken");
        sessionStorage.removeItem("vornexUser");

        location.href = "index.html";
      }
    }
     function showPaymentResult() {
      const paymentResult =
        new URLSearchParams(location.search)
          .get("payment");

      const statusBox =
        document.querySelector("#paymentStatus");

      const messages = {
        success:
          "Ödeme başarıyla tamamlandı. Bakiyeniz hesabınıza eklendi.",

        failed:
          "Ödeme tamamlanamadı. Hesabınıza bakiye eklenmedi.",

        error:
          "Ödeme sonucu kontrol edilirken bir hata oluştu."
      };

      if (!messages[paymentResult]) {
        return;
      }

      statusBox.hidden = false;
      statusBox.textContent = messages[paymentResult];

      statusBox.classList.add(
        paymentResult === "success"
          ? "success"
          : "error"
      );

      history.replaceState(
        {},
        document.title,
        location.pathname
      );
    }

    showPaymentResult();
        async function loadPaymentHistory() {
      const token =
        sessionStorage.getItem("vornexToken");

      const tableBody =
        document.querySelector(
          "#paymentHistoryBody"
        );

      if (!token || !tableBody) {
        return;
      }

      tableBody.innerHTML = `
        <tr>
          <td colspan="4">
            Ödemeler yükleniyor...
          </td>
        </tr>
      `;

      try {
        const response = await fetch(
          `${API_BASE}/payments`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const data =
          await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.message ||
            "Ödeme geçmişi alınamadı."
          );
        }

        const payments =
          Array.isArray(data.payments)
            ? data.payments
            : [];

        if (payments.length === 0) {
          tableBody.innerHTML = `
            <tr>
              <td colspan="4">
                Henüz ödeme işleminiz bulunmuyor.
              </td>
            </tr>
          `;

          return;
        }

        const moneyFormatter =
          new Intl.NumberFormat("tr-TR", {
            style: "currency",
            currency: "TRY"
          });

        const dateFormatter =
          new Intl.DateTimeFormat("tr-TR", {
            dateStyle: "short",
            timeStyle: "short"
          });

        tableBody.innerHTML =
          payments.map((payment) => {
            const paymentStatus =
              payment.status === "completed"
                ? "completed"
                : payment.status === "failed"
                  ? "failed"
                  : "pending";

            const statusText = {
              completed: "Tamamlandı",
              failed: "Başarısız",
              pending: "Bekliyor"
            }[paymentStatus];

            const paymentDate =
              dateFormatter.format(
                new Date(payment.createdAt)
              );

            return `
              <tr>
                <td>#${Number(payment.id)}</td>

                <td>
                  ${moneyFormatter.format(
                    Number(payment.amount || 0)
                  )}
                </td>

                <td>
                  <span
                    class="payment-history-badge ${paymentStatus}"
                  >
                    ${statusText}
                  </span>
                </td>

                <td>${paymentDate}</td>
              </tr>
            `;
          }).join("");

      } catch (error) {
        console.error(error);

        tableBody.innerHTML = `
          <tr>
            <td colspan="4">
              Ödeme geçmişi yüklenemedi.
            </td>
          </tr>
        `;
      }
    }

    document
      .querySelector("#refreshPayments")
      .addEventListener(
        "click",
        loadPaymentHistory
      );

    loadPaymentHistory();
    document
      .querySelector("#startPayment")
      .addEventListener("click", async () => {

        const token =
          sessionStorage.getItem("vornexToken");

        if (!token) {
          location.href = "index.html";
          return;
        }

        const button =
          document.querySelector("#startPayment");

        const amount =
          Number(
            document.querySelector("#topupAmount").value
          );

        const buyer = {
          name:
            document.querySelector("#buyerName").value.trim(),

          surname:
            document.querySelector("#buyerSurname").value.trim(),

          identityNumber:
            document
              .querySelector("#buyerIdentityNumber")
              .value
              .trim(),

          city:
            document.querySelector("#buyerCity").value.trim(),

          zipCode:
            document.querySelector("#buyerZipCode").value.trim(),

          address:
            document.querySelector("#buyerAddress").value.trim()
        };

        if (
          !buyer.name ||
          !buyer.surname ||
          !buyer.identityNumber ||
          !buyer.city ||
          !buyer.zipCode ||
          !buyer.address
        ) {
          alert("Lütfen ödeme bilgilerini eksiksiz doldurun.");
          return;
        }

        if (!/^\d{11}$/.test(buyer.identityNumber)) {
          alert("T.C. kimlik numarası 11 rakam olmalıdır.");
          return;
        }

        const originalButtonText = button.textContent;

        button.disabled = true;
        button.textContent = "Ödeme hazırlanıyor...";

        try {
          const response = await fetch(
            `${API_BASE}/payments/start`,
            {
              method: "POST",

              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
              },

              body: JSON.stringify({
                amount,
                ...buyer
              })
            }
          );

          const data =
            await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(
              data.error ||
              data.message ||
              "Ödeme başlatılamadı."
            );
          }

          if (!data.paymentPageUrl) {
            throw new Error(
              "Ödeme sayfası bağlantısı alınamadı."
            );
          }

          location.href = data.paymentPageUrl;

        } catch (error) {
          console.error(error);

          alert(
            error.message ||
            "Ödeme başlatılırken bir hata oluştu."
          );

          button.disabled = false;
          button.textContent = originalButtonText;
        }
      });
    document
      .querySelector("#panelLogout")
      .addEventListener("click", () => {

        sessionStorage.removeItem("vornexToken");
        sessionStorage.removeItem("vornexUser");

        location.href = "index.html";
      });

    loadAccount();
  