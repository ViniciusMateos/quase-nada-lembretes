import { registerRootComponent } from 'expo';
import notifee, { EventType } from '@notifee/react-native';
import * as ExpoNotifications from 'expo-notifications';

import App from './App';
import { handleNotificationEvent, handlePushSnoozeResponse } from './src/services/notifications';
import { openReminderEditFromNotification } from './src/utils/editReminderIntent';
// Importa para registrar a task de background (defineTask roda no nível do módulo).
import './src/services/backgroundTasks';

// Handler de eventos em segundo plano. Toque no corpo (PRESS) → abre a edição do
// lembrete; ações de "adiar" (ACTION_PRESS) → handleNotificationEvent.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) {
    openReminderEditFromNotification(detail.notification);
  } else {
    await handleNotificationEvent({ type, detail });
  }
});

// Mesmo "adiar", mas tocado num PUSH (o de disparo do backend): a resposta vem
// pelo expo-notifications. Fica aqui, no nível do módulo, pra valer também
// quando o iOS acorda o app em segundo plano só pra tratar a ação. Com o app
// matado ela chega como "última resposta" — trata e limpa, pra não repetir.
ExpoNotifications.addNotificationResponseReceivedListener(resp => {
  handlePushSnoozeResponse(resp).catch(() => {});
});
ExpoNotifications.getLastNotificationResponseAsync()
  .then(async resp => {
    if (await handlePushSnoozeResponse(resp)) await ExpoNotifications.clearLastNotificationResponseAsync();
  })
  .catch(() => {});

registerRootComponent(App);
