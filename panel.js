const API_BASE = "https://wornex-api.onrender.com/api";

  async function loadPanel() {
    const token =
      sessionStorage.getItem("vornexToken");

    if (!token) {
      location.href = "index.html";
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/me`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          data.message ||
          "Hesap bilgileri alınamadı."
        );
      }

      const user = data.user || {};
      document
  .querySelector("#profileEmail")
  .textContent =
    user.email || "-";

document
  .querySelector("#profilePhone")
  .textContent =
    user.phone || "Telefon eklenmemiş";

document
  .querySelector("#profilePhoneStatus")
  .textContent =
    user.phone_verified
      ? "Doğrulandı"
      : "Doğrulanmadı";
document
  .querySelector("#securityPhoneStatus")
  .textContent =
    user.phone_verified
      ? "Doğrulandı"
      : "Doğrulanmadı";

document
  .querySelector("#securityEmail")
  .textContent =
    user.email || "-";
      document
        .querySelector("#panelUserEmail")
        .textContent =
          user.email || "Kullanıcı";

      document
        .querySelector("#panelBalance")
        .textContent =
          new Intl.NumberFormat(
            "tr-TR",
            {
              style: "currency",
              currency: "TRY"
            }
          ).format(
            Number(user.balance || 0)
          );
document
  .querySelector("#panelTopBalance")
  .textContent =
    new Intl.NumberFormat(
      "tr-TR",
      {
        style: "currency",
        currency: "TRY"
      }
    ).format(
      Number(user.balance || 0)
    );
            const ordersResponse = await fetch(
        `${API_BASE}/orders`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (ordersResponse.ok) {
        const ordersData =
          await ordersResponse.json();

        const stats =
          ordersData.stats || {};

        document
          .querySelector("#panelActiveOrders")
          .textContent =
            Number(stats.activeOrders || 0);

        document
          .querySelector("#panelCompletedOrders")
          .textContent =
            Number(stats.completedOrders || 0);

        document
          .querySelector("#panelTotalSpent")
          .textContent =
            new Intl.NumberFormat(
              "tr-TR",
              {
                style: "currency",
                currency: "TRY"
              }
            ).format(
              Number(stats.totalSpent || 0)
            );
             const orders =
          Array.isArray(ordersData.orders)
            ? ordersData.orders
            : [];

        const activeOrders =
          orders.filter(
            (order) =>
              order.status === "pending"
          );

        const ordersBody =
          document.querySelector(
            "#panelOrdersBody"
          );

        if (
          ordersBody &&
          activeOrders.length > 0
        ) {
          ordersBody.innerHTML =
            activeOrders
              .map(
                (order) => `
                  <tr>
                    <td>
                      ${order.service_name || "-"}
                    </td>

                    <td>
                      ${order.country_name || "-"}
                    </td>

                    <td>
                      <strong>
                        ${order.phone_number || "-"}
                      </strong>
                    </td>

                    <td>
                      <span style="color:#f0b94d">
                        ● SMS bekleniyor
                      </span>
                    </td>

                    <td>
                      ${new Intl.NumberFormat(
                        "tr-TR",
                        {
                          style: "currency",
                          currency: "TRY"
                        }
                      ).format(
                        Number(order.price || 0)
                      )}
                    </td>

                    <td>
                      <a href="index.html#orders">
                        Görüntüle →
                      </a>
                    </td>
                  </tr>
                `
              )
              .join("");
        }
      }
    } catch (error) {
      console.error(error);

      sessionStorage.removeItem(
        "vornexToken"
      );

      sessionStorage.removeItem(
        "vornexUser"
      );

      location.href = "index.html";
    }
  }

  document
    .querySelector("#panelLogout")
    .addEventListener("click", () => {

      sessionStorage.removeItem(
        "vornexToken"
      );

      sessionStorage.removeItem(
        "vornexUser"
      );

      location.href = "index.html";
    });

 

  loadPanel();
