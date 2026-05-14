const admin = require("firebase-admin");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");

admin.initializeApp();

const db = admin.firestore();

async function enviarNotificacionSiHayToken(token, title, body, tag) {
  if (!token) return;

  try {
    await admin.messaging().send({
      token: token,
      notification: {
        title: title,
        body: body,
      },
      webpush: {
        notification: {
          title: title,
          body: body,
          icon: "/icon.png",
          tag: tag,
          renotify: true
        },
      },
    });

    console.log("Notificación enviada a:", token, "tag:", tag);
  } catch (error) {
    console.error("Error enviando notificación:", error);

    const errorCode = error?.errorInfo?.code || "";
    if (
      errorCode.includes("registration-token-not-registered") ||
      errorCode.includes("invalid-registration-token")
    ) {
      try {
        await db.collection("tokens_notificaciones").doc(token).delete();
        console.log("Token inválido eliminado:", token);
      } catch (deleteError) {
        console.error("Error borrando token inválido:", deleteError);
      }
    }
  }
}

exports.notificarCambiosPedido = onDocumentUpdated("pedidos/{pedidoId}", async (event) => {
  const antes = event.data.before.data();
  const despues = event.data.after.data();
  const pedidoId = event.params.pedidoId;

  if (!antes || !despues) return;

  const tokensSnapshot = await db
    .collection("tokens_notificaciones")
    .where("pedidoActualId", "==", pedidoId)
    .get();

  if (tokensSnapshot.empty) {
    console.log("No hay tokens para el pedido:", pedidoId);
    return;
  }

  const envios = [];

  tokensSnapshot.forEach((doc) => {
    const tokenData = doc.data();
    const token = tokenData.token;

    if (antes.estado?.caja !== "pagado" && despues.estado?.caja === "pagado") {
      envios.push(
        enviarNotificacionSiHayToken(
          token,
          "Orange Brewery",
          "💵 Tu pedido fue pagado correctamente",
          "sector-caja"
        )
      );
    }

    if (
      antes.estado?.bebidas !== "en_preparacion" &&
      despues.estado?.bebidas === "en_preparacion"
    ) {
      envios.push(
        enviarNotificacionSiHayToken(
          token,
          "Orange Brewery",
          "🧃 Tus bebidas están en preparación",
          "sector-bebidas"
        )
      );
    }

    if (antes.estado?.bebidas !== "listo" && despues.estado?.bebidas === "listo") {
      envios.push(
        enviarNotificacionSiHayToken(
          token,
          "Orange Brewery",
          "🧃 Tus bebidas están listas para retirar",
          "sector-bebidas"
        )
      );
    }

    if (
      antes.estado?.tragos !== "en_preparacion" &&
      despues.estado?.tragos === "en_preparacion"
    ) {
      envios.push(
        enviarNotificacionSiHayToken(
          token,
          "Orange Brewery",
          "🍹 Tus tragos están en preparación",
          "sector-tragos"
        )
      );
    }

    if (antes.estado?.tragos !== "listo" && despues.estado?.tragos === "listo") {
      envios.push(
        enviarNotificacionSiHayToken(
          token,
          "Orange Brewery",
          "🍹 Tus tragos están listos para retirar",
          "sector-tragos"
        )
      );
    }

    if (
      antes.estado?.cocina !== "en_preparacion" &&
      despues.estado?.cocina === "en_preparacion"
    ) {
      envios.push(
        enviarNotificacionSiHayToken(
          token,
          "Orange Brewery",
          "🍔 Tu comida está en preparación",
          "sector-cocina"
        )
      );
    }

    if (antes.estado?.cocina !== "listo" && despues.estado?.cocina === "listo") {
      envios.push(
        enviarNotificacionSiHayToken(
          token,
          "Orange Brewery",
          "🍔 Tu comida está lista para retirar",
          "sector-cocina"
        )
      );
    }
  });

  await Promise.all(envios);
});